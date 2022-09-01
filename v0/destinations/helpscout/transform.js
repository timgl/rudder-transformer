const { EventType } = require("../../../constants");
const {
  removeUndefinedAndNullValues,
  defaultRequestConfig,
  CustomError,
  getFieldValueFromMessage,
  getSuccessRespEvents,
  getErrorRespEvents
} = require("../../util");
const {
  retrieveCustomer,
  createCustomerPayloadBuilder,
  updateCustomerPayloadBuilder,
  validateUserId
} = require("./util");
const { getAccessToken } = require("../../util/helper");

const responseBuilder = async (payload, endpoint, method, accessToken) => {
  if (payload) {
    const response = defaultRequestConfig();
    response.endpoint = endpoint;
    response.headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    };
    response.method = method;

    if (method === "PATCH") {
      response.body.JSON = payload;
    } else {
      response.body.JSON = removeUndefinedAndNullValues(payload);
    }
    console.log("payload", payload);
    return response;
  }
  // fail-safety for developer error
  throw new CustomError("Payload could not be constructed", 400);
};

const identifyResponseBuilder = async (metadata, message, destination) => {
  let payload;
  let endpoint;
  let method;
  let builder;

  const accessToken = getAccessToken(metadata);
  if (!accessToken) {
    throw new CustomError("Access token is missing", 400);
  }

  const userId = getFieldValueFromMessage(message, "userId");
  let customer = "";
  if (userId && validateUserId(userId)) {
    customer = await retrieveCustomer(userId, accessToken);
  }

  if (!customer) {
    builder = createCustomerPayloadBuilder(message, destination);
    payload = builder.payload;
    endpoint = builder.endpoint;
    method = builder.method;
  } else {
    builder = updateCustomerPayloadBuilder(message);
    payload = builder.payload;
    endpoint = builder.endpoint.replace("<customerId>", userId);
    method = builder.method;
  }

  return responseBuilder(payload, endpoint, method, accessToken);
};

const processEvent = async event => {
  const { metadata, message, destination } = event;
  if (!message.type) {
    throw new CustomError(
      "Message Type is not present. Aborting message.",
      400
    );
  }
  const messageType = message.type.toLowerCase();

  if (messageType === EventType.IDENTIFY) {
    return identifyResponseBuilder(metadata, message, destination);
  }
  throw new CustomError("Message type not supported", 400);
};

const process = async event => {
  const res = await processEvent(event);
  console.log("res", res);
  return res;
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
