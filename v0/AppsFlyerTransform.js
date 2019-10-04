var jsonQ = require("jsonq");
var fs = require("fs");
var http = require("http");
var qs = require("querystring");

var aFAddToCartOrWishlistConfigFile = fs.readFileSync(
  "data/AFAddToCartOrWishlistConfig.json"
);
var aFAddToCartOrWishlistConfigJson = JSON.parse(
  aFAddToCartOrWishlistConfigFile
);

var aFPurchaseConfigFile = fs.readFileSync("data/AFPurchaseConfig.json");
var aFPurchaseConfigJson = JSON.parse(aFPurchaseConfigFile);

var aFSearchConfigFile = fs.readFileSync("data/AFSearchConfig.json");
var aFSearchConfigJson = JSON.parse(aFSearchConfigFile);

var aFContentViewConfigFile = fs.readFileSync("data/AFContentViewConfig.json");
var aFContentViewConfigJson = JSON.parse(aFContentViewConfigFile);

/* var aFCompleteRegistrationConfigFile = fs.readFileSync('data/AFCompleteRegistrationConfig.json');
var aFCompleteRegistrationConfigJson = JSON.parse(aFCompleteRegistrationConfigFile);

var aFLevelAchievedConfigFile = fs.readFileSync('data/AFLevelAchievedConfig.json');
var aFLevelAchievedConfigJson = JSON.parse(aFLevelAchievedConfigFile);

var aFListViewConfigFile = fs.readFileSync('data/AFListViewConfig.json');
var aFListViewConfigJson = JSON.parse(aFListViewConfigFile);

var aFRateConfigFile = fs.readFileSync('data/AFRateConfig.json');
var aFRateConfigJson = JSON.parse(aFRateConfigFile);

var aFSpentCreditConfigFile = fs.readFileSync('data/AFSpentCreditConfig.json');
var aFSpentCreditConfigJson = JSON.parse(aFSpentCreditConfigFile);

var aFStartTrialConfigFile = fs.readFileSync('data/AFStartTrialConfig.json');
var aFStartTrialConfigJson = JSON.parse(aFStartTrialConfigFile);

var aFSubscriptionConfigFile = fs.readFileSync('data/AFSubscriptionConfig.json');
var aFSubscriptionConfigJson = JSON.parse(aFSubscriptionConfigFile);

var aFTutorialCompletionConfigFile = fs.readFileSync('data/AFTutorialCompletionConfig.json');
var aFTutorialCompletionConfigJson = JSON.parse(aFTutorialCompletionConfigFile);

var aFTravelBookingConfigFile = fs.readFileSync('data/AFTravelBookingConfig.json');
var aFTravelBookingConfigJson = JSON.parse(aFTravelBookingConfigFile);

var aFUpdateConfigFile = fs.readFileSync('data/AFUpdateConfig.json');
var aFUpdateConfigJson = JSON.parse(aFUpdateConfigFile);

var aFInitiatedCheckoutConfigFile = fs.readFileSync('data/AFInitiatedCheckoutConfig.json');
var aFInitiatedCheckoutConfigJson = JSON.parse(aFInitiatedCheckoutConfigFile);

var aFDescriptionConfigFile = fs.readFileSync('data/AFDescriptionConfig.json');
var aFDescriptionConfigJson = JSON.parse(aFDescriptionConfigFile);

var aFAdClickOrAdViewConfigFile = fs.readFileSync('data/AFAdClickOrAdViewConfig.json');
var aFAdClickOrAdViewConfigJson = JSON.parse(aFAdClickOrAdViewConfigFile);

var aFAddPaymentInfoConfigFile = fs.readFileSync('data/AFAddPaymentInfoConfig.json');
var aFAddPaymentInfoConfigJson = JSON.parse(aFAddPaymentInfoConfigFile); */

// Helper function for generating desired JSON from Map
const mapToObj = m => {
  return Array.from(m).reduce((obj, [key, value]) => {
    obj[key] = value;
    return obj;
  }, {});
};

function getEventValueForUnIdentifiedTrackEvent(parameterMap, jsonQobj) {
  var properties = jsonQobj.find("rl_properties").value()[0];
  parameterMap.set("eventValue", JSON.stringify(properties));
}

function getEventValueMapFromMappingJson(
  parameterMap,
  jsonQobj,
  mappingJson,
  isMultiSupport
) {
  var eventValueMap = new Map();

  var moreMappedJson = mappingJson;

  // Adding mapping for free flowing rl_properties to appsFlyer.
  jsonQobj.find("rl_properties").each(function(index, path, value) {
    var mappingJsonQObj = jsonQ(mappingJson);
    jsonQ.each(value, function(key, val) {
      if (mappingJsonQObj.find("rl_properties." + key).length == 0) {
        moreMappedJson["rl_properties." + key] = key;
      }
    });
  });

  jsonQ.each(moreMappedJson, function(sourceKey, destinationKey) {
    var tempObj = jsonQobj.find("rl_context").parent();

    var pathElements = sourceKey.split(".");

    for (var i = 0; i < pathElements.length; i++) {
      tempObj = tempObj.find(pathElements[i]);
    }

    tempObj.each(function(index, path, value) {
      eventValueMap.set(String(destinationKey), String(value));
    });
  });
  if (isMultiSupport) {
    var productIdArray = jsonQobj
      .find("rl_properties")
      .find("products")
      .find("product_id")
      .parent();
    var contentIdArray = [];
    var quantityArray = [];
    var priceArray = [];
    productIdArray.each(function(path, index, value) {
      contentIdArray.push(value.product_id);
      quantityArray.push(value.quantity);
      priceArray.push(value.price);
    });
    eventValueMap.set("af_content_id", contentIdArray);
    eventValueMap.set("af_quantity", quantityArray);
    eventValueMap.set("af_price", priceArray);
  }
  var eventValue = JSON.stringify(mapToObj(eventValueMap));
  if (eventValue == "{}") {
    eventValue = "";
  }
  parameterMap.set("eventValue", eventValue);
}

function processEventTypeTrack(parameterMap, jsonQobj) {
  var eventType = String(jsonQobj.find("rl_event").value()).toLowerCase();
  var eventName = "";
  var jsonConfig = "";
  var isMultiSupport = false;
  var isUnIdentifiedEvent = false;
  switch (eventType.toLowerCase()) {
    case "wishlist product added to cart": // 'add to cart':
      eventName = "af_add_to_cart";
      jsonConfig = aFAddToCartOrWishlistConfigJson;
      isMultiSupport = true;
      break;
    case "product added to wishlist": // 'add to wishlist':
      eventName = "af_add_to_wishlist";
      jsonConfig = aFAddToCartOrWishlistConfigJson;
      isMultiSupport = true;
      break;
    case "checkout started":
      eventName = "af_initiated_checkout";
      jsonConfig = aFAddToCartOrWishlistConfigJson;
      isMultiSupport = true;
      break;
    case "order completed":
      eventName = "af_purchase";
      jsonConfig = aFPurchaseConfigJson;
      isMultiSupport = true;
      break;
    case "product removed":
      eventName = "remove_from_cart";
      jsonConfig = aFPurchaseConfigJson;
      break;
    case "products searched":
      eventName = "af_search";
      jsonConfig = aFSearchConfigJson;
      break;
    case "product viewed":
      eventName = "af_content_view";
      jsonConfig = aFContentViewConfigJson;
      isMultiSupport = true;
      break;
    default:
      eventName = eventType.toLowerCase();
      isUnIdentifiedEvent = true;
      break;
  }
  parameterMap.set("eventName", eventName);
  if (isUnIdentifiedEvent) {
    getEventValueForUnIdentifiedTrackEvent(parameterMap, jsonQobj);
  } else {
    getEventValueMapFromMappingJson(
      parameterMap,
      jsonQobj,
      jsonConfig,
      isMultiSupport
    );
  }
}

function responseBuilderSimple(parameterMap, jsonQobj) {
  var responseMap = new Map();
  var app_id = String(
    jsonQobj
      .find("rl_context")
      .find("rl_app")
      .find("rl_namespace")
      .value()
  );
  responseMap.set(
    "endpoint",
    "https://api2.appsflyer.com/inappevent/" + app_id
  );

  var requestConfigMap = new Map();
  requestConfigMap.set("request-format", "JSON");
  requestConfigMap.set("request_method", "POST");

  responseMap.set("request_config", mapToObj(requestConfigMap));

  jsonQobj.find("rl_anonymous_id").each(function(index, path, value) {
    responseMap.set("user_id", String(value));
  });

  var headerMap = new Map();
  jsonQobj.find("rl_destination").each((i, p, value) => {
    headerMap.set("authentication", String(value.Config.apiKey));
    parameterMap.set("appsflyer_id", String(value.Config.appsFlyerId));
  });
  headerMap.set("Content-Type", "application/json");
  responseMap.set("header", mapToObj(headerMap));

  jsonQobj.find("rl_destination_props").each((i, p, value) => {
    parameterMap.set("appsflyer_id", String(value.AF.rl_af_uid));
  });

  // customer_user_id
  jsonQobj.find("rl_user_id").each(function(index, path, value) {
    parameterMap.set("customer_user_id", String(value));
  });
  // parameterMap.set("advertising_id","1");
  // parameterMap.set("eventCurrency","1");
  parameterMap.set("eventTime", String(jsonQobj.find("rl_timestamp").value()));
  parameterMap.set("af_events_api", "true");

  responseMap.set("payload", mapToObj(parameterMap));

  var responseJson = JSON.stringify(mapToObj(responseMap));

  var events = [];
  events.push(responseJson);
  return events;
}

function processNonTrackEvents(parameterMap, jsonQobj, eventName) {
  parameterMap.set("eventName", eventName);
  getEventValueForUnIdentifiedTrackEvent(parameterMap, jsonQobj);
}

function processSingleMessage(jsonQobj) {
  var messageType = String(jsonQobj.find("rl_type").value()).toLowerCase();
  var parameterMap = new Map();
  var eventName = String(jsonQobj.find("rl_event").value());
  switch (messageType) {
    case "track":
      processEventTypeTrack(parameterMap, jsonQobj);
      break;
    case "screen":
      eventName = "screen";
      processNonTrackEvents(parameterMap, jsonQobj, eventName);
      break;
    case "page":
      eventName = "page";
      processNonTrackEvents(parameterMap, jsonQobj, eventName);
      break;
    default:
      parameterMap.set("eventName", eventName);
      parameterMap.set("eventValue", "");
  }
  return responseBuilderSimple(parameterMap, jsonQobj);
}

function process(jsonQobj) {
  var respList = [];
  var result;
  jsonQobj.find("rl_message").each(function(index, path, value) {
    result = processSingleMessage(jsonQ(value));
    respList.push(result);
  });
  return respList;
}

exports.process = process;
