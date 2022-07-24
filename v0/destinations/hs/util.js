const get = require("get-value");
const { send, httpGET, httpPOST } = require("../../../adapters/network");
const {
  getFieldValueFromMessage,
  constructPayload,
  CustomError,
  isEmpty
} = require("../../util");
const {
  CONTACT_PROPERTY_MAP_ENDPOINT,
  IDENTIFY_CRM_SEARCH_CONTACT
} = require("./config");

const formatKey = key => {
  // lowercase and replace spaces and . with _
  let modifiedKey = key.toLowerCase();
  modifiedKey = modifiedKey.replace(/\s+/g, "_");
  modifiedKey = modifiedKey.replace(/\./g, "_");
  return modifiedKey;
};

const getTraits = message => {
  // get from traits or properties
  let traits = getFieldValueFromMessage(message, "traits");
  if (!traits || !Object.keys(traits).length) {
    traits = message.properties;
  }
  return traits;
};

const getProperties = async destination => {
  let hubSpotPropertyMap = {};
  let res;
  const { Config } = destination;

  // select API authorization type
  if (Config.authorizationType === "newPrivateAppApi") {
    // Private Apps
    const requestOptions = {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Config.accessToken}`
      }
    };
    res = await httpGET(CONTACT_PROPERTY_MAP_ENDPOINT, requestOptions);
  } else {
    // API Key (hapikey)
    const url = `${CONTACT_PROPERTY_MAP_ENDPOINT}?hapikey=${Config.apiKey}`;
    res = await httpGET(url);
  }

  if (res.success === false) {
    // check if exists err.response && err.response.status else 500
    const error = res.response;
    if (error.response) {
      throw new CustomError(
        JSON.stringify(error.response.data) ||
          JSON.stringify(error.response.statusText) ||
          "Failed to get hubspot properties",
        error.response.status || 500
      );
    }
    throw new CustomError(
      "Failed to get hubspot properties : invalid response",
      500
    );
  }

  const propertyMap = {};
  res.response.data.forEach(element => {
    propertyMap[element.name] = element.type;
  });
  hubSpotPropertyMap = propertyMap;
  return hubSpotPropertyMap;
};

const getTransformedJSON = async (
  message,
  mappingJson,
  destination,
  propertyMap
) => {
  let rawPayload = {};
  const traits = getTraits(message);

  if (traits) {
    const traitsKeys = Object.keys(traits);
    if (!propertyMap) {
      // fetch HS properties
      // eslint-disable-next-line no-param-reassign
      propertyMap = await getProperties(destination);
    }

    rawPayload = constructPayload(message, mappingJson);

    // if there is any extra/custom property in hubspot, that has not already
    // been mapped but exists in the traits, we will include those values to the final payload
    traitsKeys.forEach(traitsKey => {
      // lowercase and replace ' ' & '.' with '_'
      const hsSupportedKey = formatKey(traitsKey);
      if (!rawPayload[traitsKey] && propertyMap[hsSupportedKey]) {
        let propValue = traits[traitsKey];
        if (propertyMap[hsSupportedKey] === "date") {
          const time = propValue;
          const date = new Date(time);
          date.setUTCHours(0, 0, 0, 0);
          propValue = date.getTime();
        }
        rawPayload[hsSupportedKey] = propValue;
      }
    });
  }
  return { ...rawPayload };
};

const formatPropertyValueForIdentify = propMap => {
  return Object.keys(propMap).map(key => {
    return { property: key, value: propMap[key] };
  });
};

const getAllContactProperties = async endpoint => {
  const requestOptions = {
    url: endpoint,
    method: "get"
  };
  const res = await send(requestOptions);
  return res;
};

const getEmailAndUpdatedProps = properties => {
  const index = properties.findIndex(prop => prop.property === "email");
  return {
    email: properties[index].value,
    updatedProperties: properties.filter((prop, i) => i !== index)
  };
};

/* NEW API util functions */

/**
 * look for the contact in hubspot and extract its contactId for updation
 * @param {*} destination
 * @returns
 */
const searchContacts = async (message, destination, lookupField = null) => {
  const { Config } = destination;
  let res;
  let contactId;
  const traits = getFieldValueFromMessage(message, "traits");
  let propertyName;

  // if propertyName (key name) is directly provided in this function
  // eg: email
  if (lookupField) {
    propertyName = lookupField;
  } else {
    // look for propertyName (key name) in traits
    // Config.lookupField -> lookupField
    // traits: { lookupField: email }
    propertyName = traits[`${Config.lookupField}`];
  }

  if (!propertyName) {
    throw new CustomError(
      `[HS] Identify:: '${Config.lookupField}' key (provided in webapp) not found in traits for contact lookup`,
      400
    );
  }

  // extract its value from the known propertyName (key name)
  // if not found in our structure then look for it in traits
  const value =
    getFieldValueFromMessage(message, propertyName) ||
    traits[`${propertyName}`];

  if (!value) {
    throw new CustomError(
      `[HS] Identify:: '${propertyName}' lookup field not found in traits for contact lookup`,
      400
    );
  }

  const requestData = {
    filterGroups: [
      {
        filters: [
          {
            propertyName,
            value,
            operator: "EQ"
          }
        ]
      }
    ],
    sorts: ["ascending"],
    properties: [propertyName],
    limit: 2,
    after: 0
  };

  if (Config.authorizationType === "newPrivateAppApi") {
    // Private Apps
    const requestOptions = {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Config.accessToken}`
      }
    };
    res = await httpPOST(
      IDENTIFY_CRM_SEARCH_CONTACT,
      requestData,
      requestOptions
    );
  } else {
    // API Key
    const url = `${IDENTIFY_CRM_SEARCH_CONTACT}?hapikey=${Config.apiKey}`;
    res = await httpPOST(url, requestData);
  }

  if (res.success === false) {
    // check if exists err.response && err.response.status else 500
    const error = res.response;
    if (error.response) {
      throw new CustomError(
        JSON.stringify(error.response?.data) ||
          JSON.stringify(error.response?.statusText) ||
          "Failed to get hubspot contacts",
        error.response?.status || 500
      );
    }
    throw new CustomError(
      "Failed to get hubspot contacts : invalid response",
      500
    );
  }

  // throw error if more than one contact is found as it's ambiguous
  if (res.response?.data?.results?.length > 1) {
    throw new CustomError(
      "Unable to get single Hubspot contact. More than one contacts found. Retry with unique lookupPropertyName and lookupValue",
      400
    );
  } else if (res.response?.data?.results?.length === 1) {
    // a single and unique contact found
    contactId = res.response?.data?.results[0]?.id;
  } else {
    // contact not found
    contactId = null;
  }

  return contactId;
};

const getCRMUpdatedProps = properties => {
  const updatedProps = {};
  properties.forEach(key => {
    const { property, value } = key;
    updatedProps[property] = value;
  });
  return updatedProps;
};

const getEventAndPropertiesFromConfig = (message, destination, payload) => {
  const { eventProperties, customBehavioralEvents } = destination.Config;

  let event = get(message, "event");
  if (!event) {
    throw new CustomError("event is required for track call", 400);
  }
  event = event.trim().toLowerCase();
  let eventName;
  const properties = {};

  // 1. fetch event name from webapp config
  const customBehavioralEventFound = customBehavioralEvents.some(
    customBehavioralEvent => {
      if (
        customBehavioralEvent &&
        customBehavioralEvent.from &&
        customBehavioralEvent.from.trim().toLowerCase() === event
      ) {
        if (!isEmpty(customBehavioralEvent.to)) {
          eventName = customBehavioralEvent.to.trim();
          return true;
        }
      }
      return false;
    }
  );

  if (!customBehavioralEventFound) {
    throw new CustomError(`[HS]:: '${event}' event not found`, 400);
  }

  // 2. fetch event properties from webapp config
  eventProperties.forEach(eventProperty => {
    if (eventProperty && eventProperty.from) {
      const value = get(message, `properties.${eventProperty.from}`);
      if (value && eventProperty.to) {
        properties[`${eventProperty.to}`] = value;
      }
    }
  });

  // eslint-disable-next-line no-param-reassign
  payload = { ...payload, eventName, properties };
  return payload;
};

module.exports = {
  formatKey,
  getTraits,
  getProperties,
  getTransformedJSON,
  formatPropertyValueForIdentify,
  getAllContactProperties,
  getEmailAndUpdatedProps,
  getCRMUpdatedProps,
  getEventAndPropertiesFromConfig,
  searchContacts
};
