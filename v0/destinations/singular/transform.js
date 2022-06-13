const {
  CONFIG_CATEGORIES,
  MAPPING_CONFIG,
  BASE_URL,
  sessionEvents,
  SINGULAR_SESSION_ANDROID_EXCLUSION,
  SINGULAR_SESSION_IOS_EXCLUSION,
  SINGULAR_EVENT_ANDROID_EXCLUSION,
  SINGULAR_EVENT_IOS_EXCLUSION
} = require("./config");
const {
  defaultRequestConfig,
  constructPayload,
  CustomError,
  defaultGetRequestConfig,
  removeUndefinedAndNullAndEmptyValues,
  getSuccessRespEvents,
  getErrorRespEvents,
  extractCustomFields,
  getValueFromMessage
} = require("../../util");

/*
  All the fields listed inside properties which are not directly mapped, will be sent to 'e' as custom event attributes
*/
const extractExtraFields = (message, EXCLUSION_FIELDS) => {
  const eventAttributes = {};
  extractCustomFields(
    message,
    eventAttributes,
    ["properties"],
    EXCLUSION_FIELDS
  );
  return eventAttributes;
};

const responseBuilderSimple = (message, { Config }) => {
  let payload, endPoint;
  let eventAttributes = {};
  const eventType = message.event;
  const response = defaultRequestConfig();
  const platform = getValueFromMessage(message, "context.os.name");
  if (!platform) {
    throw new CustomError("[Singular] :: Platform name is missing", 400);
  }
  /*
    Use the session notification endpoint to report a session to Singular
    https://support.singular.net/hc/en-us/articles/360048588672-Server-to-Server-S2S-API-Endpoint-Reference#Session_Notification_Endpoint
  */
  if (
    Config.sessionEventList.includes(eventType) ||
    sessionEvents.includes(eventType)
  ) {
    if (platform.toLowerCase() === "android") {
      payload = constructPayload(
        message,
        MAPPING_CONFIG[CONFIG_CATEGORIES.SESSION_ANDROID.name]
      );
      if (!payload) {
        // fail-safety for developer error
        throw new CustomError("Failed to Create Android Session Payload", 400);
      }
      eventAttributes = extractExtraFields(
        message,
        SINGULAR_SESSION_ANDROID_EXCLUSION
      );
    } else if (platform.toLowerCase() === "ios") {
      payload = constructPayload(
        message,
        MAPPING_CONFIG[CONFIG_CATEGORIES.SESSION_IOS.name]
      );
      if (!payload) {
        // fail-safety for developer error
        throw new CustomError("Failed to Create iOS Session Payload", 400);
      }
      eventAttributes = extractExtraFields(
        message,
        SINGULAR_SESSION_IOS_EXCLUSION
      );

      /*
        if att_authorization_status is true then dnt will be false,
        else by default dnt value is true
      */
      payload.dnt = !payload.att_authorization_status;
    } else {
      throw new CustomError("[Singular] :: Invalid Platform", 400);
    }

    // Singular maps Connection Type to either wifi or carrier
    if (message.context?.network?.wifi) {
      payload.c = "wifi";
    } else {
      payload.c = "carrier";
    }

    payload = removeUndefinedAndNullAndEmptyValues(payload);
    endPoint = `${BASE_URL}/launch`;
  } else {
    /*
      Use this endpoint to report any event occurring in your application other than the session
      https://support.singular.net/hc/en-us/articles/360048588672-Server-to-Server-S2S-API-Endpoint-Reference#Event_Notification_Endpoint
    */
    if (platform.toLowerCase() === "android") {
      payload = constructPayload(
        message,
        MAPPING_CONFIG[CONFIG_CATEGORIES.EVENT_ANDROID.name]
      );
      if (!payload) {
        // fail-safety for developer error
        throw new CustomError("Failed to Create Android Event Payload", 400);
      }

      eventAttributes = extractExtraFields(
        message,
        SINGULAR_EVENT_ANDROID_EXCLUSION
      );
    } else if (platform.toLowerCase() === "ios") {
      payload = constructPayload(
        message,
        MAPPING_CONFIG[CONFIG_CATEGORIES.EVENT_IOS.name]
      );
      if (!payload) {
        // fail-safety for developer error
        throw new CustomError("Failed to Create iOS Event Payload", 400);
      }

      eventAttributes = extractExtraFields(
        message,
        SINGULAR_EVENT_IOS_EXCLUSION
      );
    } else {
      throw new CustomError("[Singular] :: Invalid Platform", 400);
    }
    const { products } = message.properties;
    if (products && Array.isArray(products)) {
      const responseArray = [];
      const finalPayload = payload;
      for (const product of products) {
        const productDetails = constructPayload(
          product,
          MAPPING_CONFIG[CONFIG_CATEGORIES.PRODUCT_PROPERTY.name]
        );
        payload = { ...payload, ...productDetails };
        const response = defaultRequestConfig();
        response.endpoint = `${BASE_URL}/evt`;
        payload = removeUndefinedAndNullAndEmptyValues(payload);
        response.params = { ...payload, a: Config.apiKey, e: eventAttributes };
        response.method = defaultGetRequestConfig.requestMethod;
        responseArray.push(response);
        payload = finalPayload;
      }
      return responseArray;
    }
    endPoint = `${BASE_URL}/evt`;
    payload = removeUndefinedAndNullAndEmptyValues(payload);
  }

  response.endpoint = `${endPoint}`;
  response.params = { ...payload, a: Config.apiKey, e: eventAttributes };
  response.method = defaultGetRequestConfig.requestMethod;
  return response;
};

const processEvent = (message, destination) => {
  if (!message.type) {
    throw Error("Message Type is not present. Aborting message.");
  }
  const messageType = message.type.toLowerCase();

  if (messageType === "track")
    return responseBuilderSimple(message, destination);

  throw new Error("[Singular]: Message type not supported");
};

const process = event => {
  return processEvent(event.message, event.destination);
};

const processRouterDest = async inputs => {
  if (!Array.isArray(inputs) || inputs.length <= 0) {
    const respEvents = getErrorRespEvents(null, 400, "Invalid event array");
    return [respEvents];
  }

  const respList = await Promise.all(
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
          error.response
            ? error.response.status
            : error.code
            ? error.code
            : 400,
          error.message || "Error occurred while processing payload."
        );
      }
    })
  );
  return respList;
};
module.exports = { process, processRouterDest };
