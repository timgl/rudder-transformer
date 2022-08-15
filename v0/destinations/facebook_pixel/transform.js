/* eslint-disable no-param-reassign */
const sha256 = require("sha256");
const get = require("get-value");
const moment = require("moment");
const stats = require("../../../util/stats");
const {
  CONFIG_CATEGORIES,
  MAPPING_CONFIG,
  ACTION_SOURCES_VALUES,
  FB_PIXEL_DEFAULT_EXCLUSION,
  STANDARD_ECOMM_EVENTS_TYPE
} = require("./config");
const { EventType } = require("../../../constants");

const {
  CustomError,
  constructPayload,
  defaultPostRequestConfig,
  defaultRequestConfig,
  extractCustomFields,
  flattenJson,
  getErrorRespEvents,
  getIntegrationsObj,
  getSuccessRespEvents,
  isObject,
  getValidDynamicFormConfig,
  isDefinedAndNotNull
} = require("../../util");

const {
  deduceFbcParam,
  formatRevenue,
  getContentType,
  transformedPayloadData
} = require("./utils");

/**
 *
 * @param {*} message Rudder element
 * @param {*} categoryToContent [ { from: 'clothing', to: 'product' } ]
 *
 * Handles order completed and checkout started types of specific events
 */
const handleOrder = (message, categoryToContent) => {
  const { products, revenue } = message.properties;
  const value = formatRevenue(revenue);

  const contentType = getContentType(message, "product", categoryToContent);
  const contentIds = [];
  const contents = [];
  const { category } = message.properties;
  if (products) {
    if (products.length > 0 && Array.isArray(products)) {
      for (const singleProduct of products) {
        const pId =
          singleProduct.product_id || singleProduct.sku || singleProduct.id;
        if (pId) {
          contentIds.push(pId);
          // required field for content
          // ref: https://developers.facebook.com/docs/meta-pixel/reference#object-properties
          const content = {
            id: pId,
            quantity:
              singleProduct.quantity || message.properties.quantity || 1,
            item_price: singleProduct.price || message.properties.price
          };
          contents.push(content);
        }
      }
    } else {
      throw new CustomError("Product is not an object. Event not sent", 400);
    }
  }

  return {
    content_category: category,
    content_ids: contentIds,
    content_type: contentType,
    currency: message.properties.currency || "USD",
    value,
    contents: contents,
    num_items: contentIds.length
  };
};

/**
 *
 * @param {*} message Rudder element
 * @param {*} categoryToContent [ { from: 'clothing', to: 'product' } ]
 *
 * Handles product list viewed
 */
const handleProductListViewed = (message, categoryToContent) => {
  let contentType;
  const contentIds = [];
  const contents = [];
  const { products } = message.properties;
  if (products && products.length > 0 && Array.isArray(products)) {
    products.forEach(product => {
      if (isObject(product)) {
        const productId = product.product_id || product.sku || product.id;
        if (productId) {
          contentIds.push(productId);
          contents.push({
            id: productId,
            quantity: product.quantity || message.properties.quantity || 1,
            item_price: product.price
          });
        }
      } else {
        throw new CustomError("Product is not an object. Event not sent", 400);
      }
    });
  }

  if (contentIds.length > 0) {
    contentType = "product";
  } else {
    //  for viewContent event content_ids and content arrays are not mandatory
    if (message.properties?.category) {
      contentIds.push(message.properties.category);
      contents.push({
        id: message.properties.category,
        quantity: 1
      });
      contentType = "product_group";
    }
  }

  return {
    content_ids: contentIds,
    content_type: getContentType(message, contentType, categoryToContent),
    contents: contents
  };
};

/**
 *
 * @param {*} message Rudder Payload
 * @param {*} categoryToContent [ { from: 'clothing', to: 'product' } ]
 * @param {*} valueFieldIdentifier it can be either value or price which will be matched from properties and assigned to value for fb payload
 */
const handleProduct = (message, categoryToContent, valueFieldIdentifier) => {
  let contentIds = [];
  let contents = [];
  const useValue = valueFieldIdentifier === "properties.value";
  const contentId =
    message.properties.product_id ||
    message.properties.id ||
    message.properties.sku;
  const contentType = getContentType(message, "product", categoryToContent);
  const contentName =
    message.properties.product_name || message.properties.name || "";
  const contentCategory = message.properties.category || "";
  const currency = message.properties.currency || "USD";
  const value = useValue
    ? formatRevenue(message.properties.value)
    : formatRevenue(message.properties.price);
  if (contentId) {
    contentIds.push(contentId);
    contents.push({
      id: contentId,
      quantity: message.properties.quantity || 1,
      item_price: message.properties.price
    });
  }
  return {
    content_ids: contentIds,
    content_type: contentType,
    content_name: contentName,
    content_category: contentCategory,
    currency,
    value,
    contents
  };
};

const responseBuilderSimple = (
  message,
  category,
  destination,
  categoryToContent
) => {
  const { Config } = destination;
  const { pixelId, accessToken } = Config;
  const {
    blacklistPiiProperties,
    eventCustomProperties,
    valueFieldIdentifier,
    whitelistPiiProperties,
    limitedDataUSage,
    testDestination,
    testEventCode,
    standardPageCall
  } = Config;
  const integrationsObj = getIntegrationsObj(message, "fb_pixel");

  const endpoint = `https://graph.facebook.com/v13.0/${pixelId}/events?access_token=${accessToken}`;

  const userData = constructPayload(
    message,
    MAPPING_CONFIG[CONFIG_CATEGORIES.USERDATA.name],
    "fb_pixel"
  );
  if (userData) {
    const split = userData.name ? userData.name.split(" ") : null;
    if (split !== null && Array.isArray(split) && split.length === 2) {
      userData.fn =
        integrationsObj && integrationsObj.hashed ? split[0] : sha256(split[0]);
      userData.ln =
        integrationsObj && integrationsObj.hashed ? split[1] : sha256(split[1]);
    }
    delete userData.name;
    userData.fbc = userData.fbc || deduceFbcParam(message);
  }

  let customData = {};
  let commonData = {};

  commonData = constructPayload(
    message,
    MAPPING_CONFIG[CONFIG_CATEGORIES.COMMON.name],
    "fb_pixel"
  );

  if (commonData.action_source) {
    const isActionSourceValid =
      ACTION_SOURCES_VALUES.indexOf(commonData.action_source) >= 0;
    if (!isActionSourceValid) {
      throw new CustomError("Invalid Action Source type", 400);
    }
  }
  if (category.type !== "identify") {
    customData = flattenJson(
      extractCustomFields(
        message,
        customData,
        ["properties"],
        FB_PIXEL_DEFAULT_EXCLUSION
      )
    );
    if (standardPageCall && category.type === "page") {
      category.standard = true;
    }
    if (Object.keys(customData).length === 0 && category.standard) {
      throw new CustomError(
        "No properties for the event so the event cannot be sent.",
        400
      );
    }
    customData = transformedPayloadData(
      message,
      customData,
      blacklistPiiProperties,
      whitelistPiiProperties,
      category.standard,
      eventCustomProperties,
      integrationsObj
    );
    message.properties = message.properties || {};
    if (category.standard) {
      switch (category.type) {
        case "product list viewed":
          customData = {
            ...customData,
            ...handleProductListViewed(message, categoryToContent)
          };
          commonData.event_name = "ViewContent";
          break;
        case "product viewed":
          customData = {
            ...customData,
            ...handleProduct(message, categoryToContent, valueFieldIdentifier)
          };
          commonData.event_name = "ViewContent";
          break;
        case "product added":
          customData = {
            ...customData,
            ...handleProduct(message, categoryToContent, valueFieldIdentifier)
          };
          commonData.event_name = "AddToCart";
          break;
        case "order completed":
          customData = {
            ...customData,
            ...handleOrder(message, categoryToContent)
          };
          commonData.event_name = "Purchase";
          break;
        case "products searched":
          const query = message.properties?.query;
          /**
           * Facebook Pixel states "search_string" a string type
           * ref: https://developers.facebook.com/docs/meta-pixel/reference#:~:text=an%20exact%20value.-,search_string,-String
           * But it accepts "number" and "boolean" types. So, we are also doing the same by accepting "number" and "boolean"
           * and throwing an error if "Object" or other types are being sent.
           */
          const validQueryType = ["string", "number", "boolean"];
          if (query && !validQueryType.includes(typeof query)) {
            throw new CustomError(
              "'query' should be in string format only",
              400
            );
          }
          customData = {
            ...customData,
            search_string: message.properties.query
          };
          commonData.event_name = "Search";
          break;
        case "checkout started":
          customData = {
            ...customData,
            ...handleOrder(message, categoryToContent)
          };
          commonData.event_name = "InitiateCheckout";
          break;
        case "page_view": // executed when sending track calls but with standard type PageView
        case "page": // executed when page call is done with standard PageView turned on
          customData = { ...customData };
          commonData.event_name = "PageView";
          break;
        case "otherStandard":
          customData = { ...customData };
          commonData.event_name = category.event;
          break;
        default:
          throw new CustomError("This standard event does not exist", 400);
      }
      customData.currency = STANDARD_ECOMM_EVENTS_TYPE.includes(category.type)
        ? message.properties.currency || "USD"
        : undefined;
    } else {
      const { type } = category;
      if (type === "page" || type === "screen") {
        commonData.event_name = message.name
          ? `Viewed ${type} ${message.name}`
          : `Viewed a ${type}`;
      }
      if (category.type === "simple track") {
        customData.value = message.properties
          ? message.properties.revenue
          : undefined;
        delete customData.revenue;
      }
    }
  } else {
    customData = undefined;
  }
  if (limitedDataUSage) {
    const dataProcessingOptions = get(message, "context.dataProcessingOptions");
    if (dataProcessingOptions && Array.isArray(dataProcessingOptions)) {
      [
        commonData.data_processing_options,
        commonData.data_processing_options_country,
        commonData.data_processing_options_state
      ] = dataProcessingOptions;
    }
  }

  // content_category should only be a string ref: https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/custom-data

  if (
    customData &&
    customData.content_category &&
    typeof customData.content_category !== "string"
  ) {
    if (Array.isArray(customData.content_category)) {
      customData.content_category = customData.content_category
        .map(String)
        .join(",");
    } else if (typeof customData.content_category === "object") {
      throw new CustomError("Category must be must be a string");
    } else {
      customData.content_category = String(customData.content_category);
    }
    // delete customData.content_category;
  }

  if (userData && commonData) {
    const response = defaultRequestConfig();
    response.endpoint = endpoint;
    response.method = defaultPostRequestConfig.requestMethod;
    const jsonStringify = JSON.stringify({
      user_data: userData,
      ...commonData,
      custom_data: customData
    });
    const payload = {
      data: [jsonStringify]
    };

    // Ref: https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api/
    // Section: Test Events Tool
    if (testDestination) {
      payload.test_event_code = testEventCode;
    }
    response.body.FORM = payload;
    return response;
  }
  // fail-safety for developer error
  throw new CustomError("Payload could not be constructed", 400);
};

const processEvent = (message, destination) => {
  if (!message.type) {
    throw new CustomError(
      "Message Type is not present. Aborting message.",
      400
    );
  }

  const timeStamp = message.originalTimestamp || message.timestamp;
  if (timeStamp) {
    const start = moment.unix(moment(timeStamp).format("X"));
    const current = moment.unix(moment().format("X"));
    // calculates past event in days
    const deltaDay = Math.ceil(moment.duration(current.diff(start)).asDays());
    // calculates future event in minutes
    const deltaMin = Math.ceil(
      moment.duration(start.diff(current)).asMinutes()
    );
    if (deltaDay > 7 || deltaMin > 1) {
      // TODO: Remove after testing in mirror transformer
      stats.increment("fb_pixel_timestamp_error", 1, {
        destinationId: destination.ID
      });
      throw new CustomError(
        "[facebook_pixel]: Events must be sent within seven days of their occurrence or up to one minute in the future.",
        400
      );
    }
  }

  let eventsToEvents;
  if (destination.Config.eventsToEvents)
    eventsToEvents = getValidDynamicFormConfig(
      destination.Config.eventsToEvents,
      "from",
      "to",
      "FB_PIXEL",
      destination.ID
    );
  let categoryToContent;
  if (destination.Config.categoryToContent)
    categoryToContent = getValidDynamicFormConfig(
      destination.Config.categoryToContent,
      "from",
      "to",
      "FB_PIXEL",
      destination.ID
    );
  const { advancedMapping } = destination.Config;
  let standard;
  let standardTo = "";
  let checkEvent;
  const messageType = message.type.toLowerCase();
  let category;
  switch (messageType) {
    case EventType.IDENTIFY:
      if (advancedMapping) {
        category = CONFIG_CATEGORIES.USERDATA;
        break;
      } else {
        throw new CustomError(
          "Advanced Mapping is not on Rudder Dashboard. Identify events will not be sent.",
          400
        );
      }
    case EventType.PAGE:
    case EventType.SCREEN:
      category = CONFIG_CATEGORIES.PAGE;
      break;
    case EventType.TRACK:
      if (!message.event) {
        throw new CustomError("Event name is required", 400);
      }
      standard = eventsToEvents;
      if (standard) {
        standardTo = standard.reduce((filtered, standards) => {
          if (standards.from.toLowerCase() === message.event.toLowerCase()) {
            filtered = standards.to;
          }
          return filtered;
        }, "");
      }
      checkEvent = standardTo !== "" ? standardTo : message.event.toLowerCase();

      switch (checkEvent) {
        case CONFIG_CATEGORIES.PRODUCT_LIST_VIEWED.type:
        case "ViewContent":
          category = CONFIG_CATEGORIES.PRODUCT_LIST_VIEWED;
          break;
        case CONFIG_CATEGORIES.PRODUCT_VIEWED.type:
          category = CONFIG_CATEGORIES.PRODUCT_VIEWED;
          break;
        case CONFIG_CATEGORIES.PRODUCT_ADDED.type:
        case "AddToCart":
          category = CONFIG_CATEGORIES.PRODUCT_ADDED;
          break;
        case CONFIG_CATEGORIES.ORDER_COMPLETED.type:
        case "Purchase":
          category = CONFIG_CATEGORIES.ORDER_COMPLETED;
          break;
        case CONFIG_CATEGORIES.PRODUCTS_SEARCHED.type:
        case "Search":
          category = CONFIG_CATEGORIES.PRODUCTS_SEARCHED;
          break;
        case CONFIG_CATEGORIES.CHECKOUT_STARTED.type:
        case "InitiateCheckout":
          category = CONFIG_CATEGORIES.CHECKOUT_STARTED;
          break;
        case "AddToWishlist":
        case "AddPaymentInfo":
        case "Lead":
        case "CompleteRegistration":
        case "Contact":
        case "CustomizeProduct":
        case "Donate":
        case "FindLocation":
        case "Schedule":
        case "StartTrial":
        case "SubmitApplication":
        case "Subscribe":
          category = CONFIG_CATEGORIES.OTHER_STANDARD;
          category.event = checkEvent;
          break;
        case "PageView":
          category = CONFIG_CATEGORIES.PAGE_VIEW;
          break;
        default:
          category = CONFIG_CATEGORIES.SIMPLE_TRACK;
          break;
      }
      break;
    default:
      throw new CustomError("Message type not supported", 400);
  }
  // build the response
  return responseBuilderSimple(
    message,
    category,
    destination,
    categoryToContent
  );
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
