const { set } = require("lodash");
const {
  defaultRequestConfig,
  removeUndefinedAndNullValues,
  getFieldValueFromMessage,
  simpleProcessRouterDest
} = require("../../util");
const { TRANSFORMER_METRIC } = require("../../util/constant");
const ErrorBuilder = require("../../util/error");
const { DESTINATION, ConfigCategories, configCategories } = require("./config");
const { getDestinationExternalID } = require("../../util");
const { refinePayload } = require("./util");
const { EventType } = require("../../../constants");

const responseBuilder = (payload, endpoint, method, Config) => {
  const { apiKey } = Config;
  const response = defaultRequestConfig();
  response.headers = {
    "x-api-key": `${apiKey}`
  };
  response.body.JSON = removeUndefinedAndNullValues(payload);
  response.endpoint = endpoint;
  response.method = method;
  return response;
};

const identifyResponseBuilder = (traits, Config, leadId) => {
  if (!traits) {
    throw new ErrorBuilder()
      .setMessage("Traits not Provided")
      .setStatus(400)
      .setStatTags({
        destType: DESTINATION,
        stage: TRANSFORMER_METRIC.TRANSFORMER_STAGE.TRANSFORM,
        scope: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.SCOPE,
        meta: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.META.BAD_PARAM
      })
      .build();
  }
  let payload;
  let endpoint;
  let method;

  if (!leadId) {
    // creating new Lead
    // map first_name from firstName and lastName
    const leadInfo = traits;
    const refinedInfo = refinePayload(leadInfo);
    if (traits?.dup) {
      set(payload, "dup", traits.dup);
    }
    if (traits?.creator_id) {
      set(payload, "reator_id", traits.reator_id);
    }
    if (traits?.firstName || traits?.firstname) {
      set(payload, "first_name", traits?.firstName || traits?.firstname);
    }
    if (traits?.lastName || traits?.lastname) {
      set(payload, "last_name", traits?.lastName || traits?.lastname);
    }
    if (!refinedInfo?.email) {
      throw new ErrorBuilder()
        .setMessage("Email could not be found.")
        .setStatus(400)
        .setStatTags({
          destType: DESTINATION,
          stage: TRANSFORMER_METRIC.TRANSFORMER_STAGE.TRANSFORM,
          scope: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.SCOPE,
          meta:
            TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.META.BAD_PARAM
        })
        .build();
    }
    set(payload, "leads", [leadInfo]);
    endpoint = configCategories.Create.endpoint;
    method = configCategories.Create.method;
  } else {
    // updating existing lead
    const leadInfo = traits;
    const refinedInfo = refinePayload(leadInfo);
    endpoint = `${configCategories.Update.endpoint.replace("leadId", leadId)}`;
    method = configCategories.Update.method;
    set(payload, "data", refinedInfo);
    // check for status and status Id
  }
  return responseBuilder(payload, endpoint, method, Config);
};

const groupResponseBuilder = (message, traits, Config, leadId) => {
  const { groupId } = message;
  if (!groupId) {
    throw new ErrorBuilder()
      .setMessage("Group Id can not be empty.")
      .setStatus(400)
      .setStatTags({
        destType: DESTINATION,
        stage: TRANSFORMER_METRIC.TRANSFORMER_STAGE.TRANSFORM,
        scope: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.SCOPE,
        meta: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.META.BAD_PARAM
      })
      .build();
  }
  if (!leadId) {
    throw new ErrorBuilder()
      .setMessage("Lead Id can not be empty.")
      .setStatus(400)
      .setStatTags({
        destType: DESTINATION,
        stage: TRANSFORMER_METRIC.TRANSFORMER_STAGE.TRANSFORM,
        scope: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.SCOPE,
        meta: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.META.BAD_PARAM
      })
      .build();
  }
  if (
    traits.operation &&
    traits.operation !== "remove" &&
    traits.operation !== "add"
  ) {
    throw new ErrorBuilder()
      .setMessage(
        `${traits.operation} is invalid for Operation field. Available are add or remove.`
      )
      .setStatus(400)
      .setStatTags({
        destType: DESTINATION,
        stage: TRANSFORMER_METRIC.TRANSFORMER_STAGE.TRANSFORM,
        scope: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.SCOPE,
        meta: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.META.BAD_PARAM
      })
      .build();
  }
  const operation = traits.operation ? traits.operation : "add";
  if (operation === "remove") {
    const { method } = ConfigCategories.Group.remove;
    let { endpoint } = ConfigCategories.Group.remove;
    endpoint = endpoint
      .replace(":config_id", groupId)
      .replace(":lead_id", leadId);
    return responseBuilder({}, endpoint, method, Config);
  }
  // let payload = { subscribed: subscriberStatus };
  const { method } = ConfigCategories.Group.add;
  let { endpoint } = ConfigCategories.Group.add;
  endpoint = endpoint.replace(":config_id", groupId);
  const payload = {};
  set(payload, "lead_id", leadId);
  return responseBuilder(payload, endpoint, method, Config);
};
const process = event => {
  const { message, destination } = event;
  const { Config } = destination;

  if (!message.type) {
    throw new ErrorBuilder()
      .setMessage("Message Type is not present. Aborting message.")
      .setStatus(400)
      .setStatTags({
        destType: DESTINATION,
        stage: TRANSFORMER_METRIC.TRANSFORMER_STAGE.TRANSFORM,
        scope: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.SCOPE,
        meta: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.META.BAD_PARAM
      })
      .build();
  }
  const messageType = message.type.toLowerCase();
  let response;
  const traits = getFieldValueFromMessage(message, "traits");
  const leadId = getDestinationExternalID(message, "persisitIqLeadId");
  switch (messageType) {
    case EventType.IDENTIFY:
      response = identifyResponseBuilder(traits, Config, leadId);
      break;
    case EventType.GROUP:
      response = groupResponseBuilder(message, traits, Config, leadId);
      break;
    default:
      throw new ErrorBuilder()
        .setMessage(`Message type ${(messageType, Config)} not supported.`)
        .setStatus(400)
        .setStatTags({
          destType: DESTINATION,
          stage: TRANSFORMER_METRIC.TRANSFORMER_STAGE.TRANSFORM,
          scope: TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.SCOPE,
          meta:
            TRANSFORMER_METRIC.MEASUREMENT_TYPE.TRANSFORMATION.META.BAD_PARAM
        })
        .build();
  }
  return response;
};
const processRouterDest = async inputs => {
  const respList = await simpleProcessRouterDest(inputs, "PERSISTIQ", process);
  return respList;
};

module.exports = { process, processRouterDest };
