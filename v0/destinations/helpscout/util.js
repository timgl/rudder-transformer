const {
  BASE_ENDPOINT,
  VERSION,
  excludeKeys,
  keysWithTypes,
  keysMappingWithDefaultTypes,
  addOperations,
  operation,
  paths,
  keysMappingWithTypes,
  acceptedEmailTypes,
  acceptedPhoneTypes,
  acceptedChatTypes,
  acceptedSocialProfileTypes
} = require("./config");
const {
  httpGET,
  prepareProxyRequest,
  proxyRequest
} = require("../../../adapters/network");
const {
  processAxiosResponse
} = require("../../../adapters/utils/networkUtils");
const { CustomError, constructPayload } = require("../../util");
const { CONFIG_CATEGORIES, MAPPING_CONFIG } = require("./config");
const ErrorBuilder = require("../../util/error");
const {
  DISABLE_DEST,
  REFRESH_TOKEN
} = require("../../../adapters/networkhandler/authConstants");

const validateUserId = userId => {
  return /^[0-9]+$/.test(userId);
};

const validatePropertyType = (key, propertyType) => {
  switch (key) {
    case "emails":
      return acceptedEmailTypes.includes(propertyType);
    case "phones":
      return acceptedPhoneTypes.includes(propertyType);
    case "chats":
      return acceptedChatTypes.includes(propertyType);
    case "socialProfiles":
      return acceptedSocialProfileTypes.includes(propertyType);
    default:
      return false;
  }
};

const getPropertyType = (key, message) => {
  if (!message.traits) {
    return keysMappingWithDefaultTypes[key];
  }

  const { traits } = message;
  const propertyName = keysMappingWithTypes[key];
  if (traits[propertyName]) {
    const propertyType = traits[propertyName];
    return validatePropertyType(key, propertyType)
      ? propertyType
      : keysMappingWithDefaultTypes[key];
  }
  return keysMappingWithDefaultTypes[key];
};

const getPropertyOperation = key => {
  if (addOperations.includes(key)) {
    return operation.ADD;
  }
  return operation.REPLACE;
};

const getFormattedPropertyValue = (key, category, payload, message) => {
  const data = { ...payload };

  if (category === CONFIG_CATEGORIES.CREATE_USER) {
    return key === "websites"
      ? [
          {
            value: data[key]
          }
        ]
      : [
          {
            type: getPropertyType(key, message),
            value: data[key]
          }
        ];
  }
  return key === "websites"
    ? {
        value: data[key]
      }
    : {
        type: getPropertyType(key, message),
        value: data[key]
      };
};

const preparePropertyKey = (message, customMappings) => {
  const { traits, context } = message;
  const properties = [];
  customMappings.forEach(mapping => {
    const { from, to } = mapping;
    if (traits[from] || context.traits[from]) {
      properties.push({
        slug: to,
        value: traits[from] || context.traits[from]
      });
    }
  });
  return properties;
};

const prepareAddressKey = (payload, category) => {
  const data = { ...payload };
  const key = "address";
  if (category === CONFIG_CATEGORIES.CREATE_USER) {
    return data;
  }
  const address = data[key];
  delete data[key];
  const addressKeys = Object.keys(address);

  addressKeys.forEach(addressKey => {
    data[addressKey] = address[addressKey];
  });

  return data;
};

const mapKeyWithTypes = (payload, category, message) => {
  let data = { ...payload };
  const keys = Object.keys(data);

  keys.forEach(key => {
    if (keysWithTypes.includes(key)) {
      data[key] = getFormattedPropertyValue(key, category, data, message);
    } else if (key === "address") {
      data = prepareAddressKey(data, category);
    }
  });

  return data;
};

/**
 * Returns 'Create User' payload
 * @param {*} message
 * @returns
 */
const createCustomerPayloadBuilder = (message, destination) => {
  let payload = constructPayload(
    message,
    MAPPING_CONFIG[CONFIG_CATEGORIES.CREATE_USER.name]
  );
  payload = mapKeyWithTypes(payload, CONFIG_CATEGORIES.CREATE_USER, message);

  const { Config } = destination;
  const { customMappings } = Config;
  if (customMappings && customMappings.length >= 1) {
    payload.properties = preparePropertyKey(message, customMappings);
  }

  const { endpoint } = CONFIG_CATEGORIES.CREATE_USER;
  const method = "POST";
  delete payload.customerId;
  return { payload, endpoint, method };
};

/**
 * Returns 'Update Use Formatted Payload' payload
 * @param {*} payload
 * @returns
 */
const updatePayloadFormat = (payload, message) => {
  const data = mapKeyWithTypes(payload, CONFIG_CATEGORIES.UPDATE_USER, message);
  const finalPayLoad = [];
  const keys = Object.keys(data).filter(key => !excludeKeys.includes(key));
  keys.forEach(key => {
    finalPayLoad.push({
      op: getPropertyOperation(key),
      path: paths[key],
      value: data[key]
    });
  });
  return [...finalPayLoad];
};

/**
 * Returns 'Update User' payload
 * @param {*} message
 * @returns
 */
const updateCustomerPayloadBuilder = message => {
  let payload = constructPayload(
    message,
    MAPPING_CONFIG[CONFIG_CATEGORIES.UPDATE_USER.name]
  );
  payload = updatePayloadFormat(payload, message);
  const { endpoint } = CONFIG_CATEGORIES.UPDATE_USER;
  const method = "PATCH";
  return { payload, endpoint, method };
};

const responseHandler = destinationResponse => {
  const message = `[HelpScout] - Request Processed Successfully`;
  const { status } = destinationResponse;

  return {
    status,
    message,
    destinationResponse
  };
};

const getAuthErrCategory = code => {
  switch (code) {
    case 401:
      return REFRESH_TOKEN;
    case 403: // Access Denied
      return DISABLE_DEST;
    default:
      return "";
  }
};

/**
 * Returns HelpScout customer object if it present
 * ref: https://developer.helpscout.com/mailbox-api/endpoints/customers/get/
 * @param {*} userId
 * @param {*} accessToken
 * @returns
 */
const retrieveCustomer = async (userId, accessToken) => {
  const endpoint = `${BASE_ENDPOINT}/${VERSION}/customers/${userId}`;
  const requestOptions = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    }
  };

  const userResponse = await httpGET(endpoint, requestOptions);
  const processedUserResponse = processAxiosResponse(userResponse);

  if (processedUserResponse.status === 200) {
    return processedUserResponse.response;
  }

  if (processedUserResponse.status === 401) {
    // const { response } = processedUserResponse;
    // throw new ErrorBuilder()
    //   .setStatus(processedUserResponse.status)
    //   .setDestinationResponse(response)
    //   .setMessage(`HelpScout: ${response.err}`)
    //   .setAuthErrorCategory(getAuthErrCategory(processedUserResponse.status))
    //   .build();
  }

  if (processedUserResponse.status !== 404) {
    throw new CustomError(
      `[HelpScout]:: Unable to retrieve customer due to ${JSON.stringify(
        processedUserResponse.response
      )}`,
      processedUserResponse.status
    );
  }

  return null;
};

class networkHandler {
  constructor() {
    this.responseHandler = responseHandler;
    this.proxy = proxyRequest;
    this.prepareProxy = prepareProxyRequest;
    this.processAxiosResponse = processAxiosResponse;
  }
}

module.exports = {
  retrieveCustomer,
  createCustomerPayloadBuilder,
  updateCustomerPayloadBuilder,
  networkHandler,
  validateUserId
};
