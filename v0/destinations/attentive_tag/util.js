/* eslint-disable no-restricted-syntax */
const get = require("get-value");
const moment = require("moment");
const {
  CustomError,
  constructPayload,
  isDefinedAndNotNull,
  getDestinationExternalID
} = require("../../util");
const { mappingConfig, ConfigCategory } = require("./config");

const getPropertiesKeyValidation = payload => {
  const validationArray = [`'`, `"`, `{`, `}`, `[`, `]`, ",", `,`];
  const keys = Object.keys(payload.properties);
  for (const key of keys) {
    for (const validationChar of validationArray) {
      if (key.includes(validationChar)) {
        return false;
      }
    }
  }
  return true;
};

// add documentation
const getExternalIdentifiersMapping = message => {
  const externalIdentifiers = ["clientUserId", "shopifyId", "klaviyoId"];
  const externalId = get(message, "context.externalId");
  if (!externalId) {
    return null;
  }
  const idObj = {};
  const customIdentifiers = [];
  if (externalId && Array.isArray(externalId)) {
    externalId.forEach(id => {
      const idType = id.type;
      const val = getDestinationExternalID(message, idType);
      if (val && externalIdentifiers.includes(idType)) {
        idObj[idType] = val;
      } else if (val) {
        customIdentifiers.push({ name: idType, value: val });
      }
    });
    if (customIdentifiers.length) {
      idObj.customIdentifiers = customIdentifiers;
    }
  }
  return idObj;
};

const validateTimestamp = timeStamp => {
  if (timeStamp) {
    const start = moment.unix(moment(timeStamp).format("X"));
    const current = moment.unix(moment().format("X"));
    // calculates past event in hours
    const deltaDay = Math.ceil(moment.duration(current.diff(start)).asHours());
    if (deltaDay > 12) {
      return false;
    }
  }
  return true;
};

const getDestinationItemProperties = (message, isItemsRequired) => {
  let items;
  const products = get(message, "properties.products");
  if (!products) {
    items = [];
    const price = [];
    const pricing = {};
    const properties = get(message, "properties");
    const props = constructPayload(
      properties,
      mappingConfig[ConfigCategory.ITEMS.name]
    );
    pricing.value = parseInt(properties.price, 10);
    pricing.currency = properties.currency;
    price.push(pricing);
    props.price = price;
    items.push(props);
    return items;
  }
  if ((!products && isItemsRequired) || (products && products.length === 0)) {
    throw new CustomError(
      `Products is an required field for '${message.event}' event`,
      400
    );
  }
  if (products && Array.isArray(products)) {
    items = [];
    products.forEach(item => {
      const element = constructPayload(
        item,
        mappingConfig[ConfigCategory.ITEMS.name]
      );
      const price = [];
      const pricing = {};
      pricing.value = parseInt(item.price, 10);
      pricing.currency = item.currency;
      price.push(pricing);
      if (
        !isDefinedAndNotNull(element.productId) ||
        !isDefinedAndNotNull(element.productVariantId) ||
        !isDefinedAndNotNull(pricing.value)
      ) {
        throw new CustomError(
          "product_id and product_variant_id and price are required",
          400
        );
      }
      element.price = price;
      items.push(element);
    });
  } else if (products && !Array.isArray(products)) {
    throw new CustomError("Invalid type. Expected Array of products", 400);
  }
  return items;
};

module.exports = {
  getDestinationItemProperties,
  getExternalIdentifiersMapping,
  getPropertiesKeyValidation,
  validateTimestamp
};
