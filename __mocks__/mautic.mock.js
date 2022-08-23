const fs = require("fs");
const path = require("path");

const urlDirectoryMap = {
  "ruddertest2.mautic.net": "mautic"
};

const getData = url => {
  let directory = "";
  Object.keys(urlDirectoryMap).forEach(key => {
    if (url.includes(key)) {
      directory = urlDirectoryMap[key];
    }
  });
  if (directory) {
    const dataFile = fs.readFileSync(
      path.resolve(__dirname, `./data/${directory}/response.json`)
    );
    const data = JSON.parse(dataFile);
    return data[url];
  }
  return {};
};

const mauticGetRequestHandler = url => {
  const mockData = getData(url);
  // console.log(mockData);
  if (mockData) {
    //resolve with status 200
    return { data: mockData, status: 200 };
  }
  return new Promise((resolve, reject) => {
    resolve({ error: "Request failed", status: 404 });
  });
};

module.exports = {
    mauticGetRequestHandler
};