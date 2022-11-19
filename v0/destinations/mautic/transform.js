const {
  defaultRequestConfig,
  constructPayload,
  removeUndefinedAndNullValues,
  getErrorRespEvents,
  getSuccessRespEvents,
  getDestinationExternalID,
  defaultPostRequestConfig,
  defaultPatchRequestConfig,
  TransformationError
} = require("../../util");

const {
  validateEmail,
  deduceAddressFields,
  deduceStateField,
  validatePayload,
  searchContactIds,
  validateGroupCall
} = require("./utils");

const { EventType } = require("../../../constants");
const { TRANSFORMER_METRIC } = require("../../util/constant");

const {
  BASE_URL,
  mappingConfig,
  ConfigCategories,
  DESTINATION
} = require("./config");

const responseBuilder = async (
  payload,
  endpoint,
  method,
  messageType,
  Config
) => {
  const { userName, password } = Config;
  if (messageType === EventType.IDENTIFY && !payload) {
    throw new TransformationError(
      "Payload could not be constructed",
      400,
      {
        scope: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.SCOPE,
        meta: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.META.BAD_EVENT
      },
      DESTINATION
    );
  } else {
    const response = defaultRequestConfig();
    if (messageType === EventType.IDENTIFY) {
      response.body.JSON = removeUndefinedAndNullValues(payload);
    } else {
      response.body.FORM = removeUndefinedAndNullValues(payload);
    }
    response.endpoint = endpoint;
    const basicAuth = Buffer.from(`${userName}:${password}`).toString("base64");
    response.headers = {
      "Content-Type": "application/json",
      Authorization: `Basic ${basicAuth}`
    };
    response.method = method;
    return response;
  }
};

/**
 *
 * @param {*} message
 * @param {*} Config
 * @param {*} endPoint
 * @returns build response for group call
 */
const groupResponseBuilder = async (message, Config, endPoint) => {
  let groupClass;
  validateGroupCall(message);
  switch (message.traits?.type?.toLowerCase()) {
    case "segments":
      groupClass = "segments";
      break;
    case "campaigns":
      groupClass = "campaigns";
      break;
    case "companies":
      groupClass = "companies";
      break;
    default:
      throw new TransformationError(
        "This grouping is not supported. Supported Groupings : Segments, Companies, Campaigns.",
        400,
        {
          scope: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.SCOPE,
          meta:
            TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.META.BAD_EVENT
        },
        DESTINATION
      );
  }
  let contactId = getDestinationExternalID(message, "mauticContactId");
  if (!contactId) {
    const contacts = await searchContactIds(message, Config, endPoint);
    if (!contacts || contacts.length === 0) {
      throw new TransformationError(
        "Could not find any contact Id for the given lookup Field or email.",
        400,
        {
          scope: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.SCOPE,
          meta:
            TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.META
              .CONFIGURATION
        },
        DESTINATION
      );
    }
    if (contacts.length > 1) {
      throw new TransformationError(
        "Found more than one Contacts for the given lookupField or email. Retry with unique lookupfield and lookupValue.",
        400,
        {
          scope: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.SCOPE,
          meta:
            TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.META
              .CONFIGURATION
        },
        DESTINATION
      );
    }
    if (contacts.length === 1) {
      const [first] = contacts;
      contactId = first;
    }
  }

  if (
    message.traits.operation &&
    message.traits.operation !== "remove" &&
    message.traits.operation !== "add"
  ) {
    throw new TransformationError(
      `${message.traits.operation} is invalid for Operation field. Available are add or remove.`,
      400,
      {
        scope: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.SCOPE,
        meta: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.META.BAD_EVENT
      },
      DESTINATION
    );
  }
  const operation = message.traits.operation || "add";
  const endpoint = `${endPoint}/${groupClass}/${message.groupId}/contact/${contactId}/${operation}`;
  const payload = {};
  return responseBuilder(
    payload,
    endpoint,
    defaultPostRequestConfig.requestMethod,
    EventType.GROUP,
    Config
  );
};

/**
 *
 * @param {*} message
 * @param {*} Config
 * @param {*} endPoint
 * @returns build response for identify call
 */
const identifyResponseBuilder = async (message, Config, endpoint) => {
  let method;
  let endPoint;
  // constructing payload from mapping JSONs
  const payload = constructPayload(
    message,
    mappingConfig[ConfigCategories.IDENTIFY.name]
  );
  if (validatePayload(payload)) {
    const { address1, address2 } = deduceAddressFields(message);
    deduceStateField(payload);
    payload.address1 = address1;
    payload.address2 = address2;
  }
  /* 
     1. if contactId is present  inside externalID we will use that
     2. Otherwise we will look for the lookup field from the web app 
  */
  let contactId = getDestinationExternalID(message, "mauticContactId");

  if (!contactId) {
    const contacts = await searchContactIds(message, Config, endpoint);
    if (contacts?.length === 1) {
      const [first] = contacts;
      contactId = first;
      endPoint = `${endpoint}/contacts/${contactId}/edit`;
      method = defaultPatchRequestConfig.requestMethod;
    } else {
      endPoint = `${endpoint}/contacts/new`;
      method = defaultPostRequestConfig.requestMethod;
    }
  } else {
    endPoint = `${endpoint}/contacts/${contactId}/edit`;
    method = defaultPatchRequestConfig.requestMethod;
  }

  return responseBuilder(payload, endPoint, method, EventType.IDENTIFY, Config);
};

const process = async event => {
  const { message, destination } = event;
  const { password, subDomainName, userName } = destination.Config;
  const endpoint = `${BASE_URL.replace("subDomainName", subDomainName)}`;
  if (!password) {
    throw new TransformationError("Password field can not be empty.", 400);
  }
  if (!subDomainName) {
    throw new TransformationError(
      "Sub-Domain Name field can not be empty.",
      400
    );
  }
  if (!validateEmail(userName)) {
    throw new TransformationError(
      "User Name is not Valid.",
      400,
      {
        scope: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.SCOPE,
        meta: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.META.BAD_PARAM
      },
      DESTINATION
    );
  }

  // Validating if message type is even given or not
  if (!message.type) {
    throw new TransformationError(
      "Message Type is not present. Aborting message.",
      400,
      {
        scope: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.SCOPE,
        meta: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.META.BAD_EVENT
      },
      DESTINATION
    );
  }
  const messageType = message.type.toLowerCase();
  let response;
  switch (messageType) {
    case EventType.IDENTIFY:
      response = await identifyResponseBuilder(
        message,
        destination.Config,
        endpoint
      );
      break;
    case EventType.GROUP:
      response = await groupResponseBuilder(
        message,
        destination.Config,
        endpoint
      );
      break;
    default:
      throw new TransformationError(
        `Message type ${messageType} not supported.`,
        400,
        {
          scope: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.SCOPE,
          meta:
            TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.META.BAD_EVENT
        },
        DESTINATION
      );
  }
  return response;
};

const processRouterDest = async inputs => {
  if (!Array.isArray(inputs) || inputs.length <= 0) {
    const respEvents = getErrorRespEvents(null, 400, "Invalid event array");
    return [respEvents];
  }

  return Promise.all(
    inputs.map(async input => {
      try {
        if (input.message.statusCode) {
          // already transformed event
          return getSuccessRespEvents(
            input.message,
            [input.metadata],
            input.destination
          );
        }
        // if not transformed
        return getSuccessRespEvents(
          await process(input),
          [input.metadata],
          input.destination
        );
      } catch (error) {
        return getErrorRespEvents(
          [input.metadata],
          error.response ? error.response.status : error.code || 400,
          error.message || "Error occurred while processing payload."
        );
      }
    })
  );
};

module.exports = { process, processRouterDest };
