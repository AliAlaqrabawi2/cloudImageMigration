
// Array of cloudimg domains to replace
const CLOUDIMG_DOMAINS = [
  'https://alnnibitpo.cloudimg.io/v7/',
  'https://alnnibitpo.cloudimg.io/',
  'https://czi3m2qn.cloudimg.io/cdn/n/n/',
  'https://acbbesnfco.cloudimg.io/v7'
];

const CLOUDIMG_DOMAIN_MAPPING = {
  's3-us-west-2.amazonaws.com/imageserver.prod': 'buildfire.imgix.net',
  's3-us-west-2.amazonaws.com/pluginserver.prod': 'bfplugins.imgix.net',
  's3-us-west-2.amazonaws.com/imagelibserver': 'buildfire-uat.imgix.net',
  's3-us-west-2.amazonaws.com/pluginserver.uat': 'bfplugins-uat.imgix.net',
  's3-us-west-2.amazonaws.com/pluginserver.uat2': 'bfplugins-uat.imgix.net',
  's3-us-west-2.amazonaws.com/pluginserver.uat3': 'bfplugins-uat.imgix.net',
  's3.us-west-2.amazonaws.com/imageserver.prod': 'buildfire.imgix.net',
  's3.us-west-2.amazonaws.com/pluginserver.prod': 'bfplugins.imgix.net',
  'imageserver.prod.s3.amazonaws.com': 'buildfire.imgix.net',
  's3.amazonaws.com/Kaleo.DevBucket': 'bflegacy.imgix.net',
  'pluginserver.buildfire.com': 'bflegacy.imgix.net',
  'uat-fileserver.buildfire.com': 'bflegacy.imgix.net',
  'uat-auth.buildfire.com': 'bflegacy.imgix.net',
  'bfplugins-uat.imgix.net': 'bfplugins-uat.imgix.net',

};

const removeDuplicateCloudImgWrappers = function (inputString) {
  for (const domain of CLOUDIMG_DOMAINS) {

    const parts = inputString.split(domain);

    if (parts.length <= 2) continue;

    inputString = domain + parts[parts.length - 1];
  }

  return inputString;
};

const sanitizeUrl = url => url.trim();

const addQueryParams = (url, params) => {
  const hasQuery = url.includes('?');
  const connector = hasQuery ? '&' : '?';
  return url + connector + params;
};

const replaceCloudImgURLs = (inputString) => {
  inputString = removeDuplicateCloudImgWrappers(inputString);
  const patterns = [
    {
      regex: /https:\/\/([a-z0-9]+)\.cloudimg\.io\/s\/width\/(\d+)\/https:\/\/([^"\s]+)/gi,
      buildUrl: (filePath, width, height) => `width=${width}`
    },
    {
      regex: /https:\/\/([a-z0-9]+)\.cloudimg\.io\/bound\/(\d+)x(\d+)\/n\/https:\/\/([^"\s]+)/gi,
      buildUrl: (filePath, width, height) => `width=${width}&height=${height}`
    },
    {
      regex: /https:\/\/([a-z0-9]+)\.cloudimg\.io\/crop\/(\d+)x(\d+)\/n\/https:\/\/([^"\s]+)/gi,
      buildUrl: (filePath, width, height) => `crop=true&width=${width}&height=${height}`
    },
    {
      regex: /https:\/\/([a-z0-9]+)\.cloudimg\.io(\/[^\/]+)?\/https:\/\/([^"\s]+)/gi,
      buildUrl: (filePath) => ''
    }
  ];

  for (const {regex, buildUrl} of patterns) {
    inputString = inputString.replace(regex, (...args) => {
      const fullMatch = args[0];
      const groups = args.slice(1, -2);

      let width, height, sanitizedFilePath;

      if (groups.length === 2) {

        sanitizedFilePath = sanitizeUrl(groups[1]);
        width = undefined;
        height = undefined;
      } else if (groups.length === 3) {
        width = groups[1];
        sanitizedFilePath = sanitizeUrl(groups[2]);
        height = undefined;
      } else {
        width = groups[1];
        height = groups[2];
        sanitizedFilePath = sanitizeUrl(groups[3]);
      }

      if (sanitizedFilePath.includes('images.unsplash.com')) {
        if (width || height) {
          let params = width ? `width=${width}` : '';
          if (height) params += `&height=${height}`;
          return `https://${addQueryParams(sanitizedFilePath, params)}`;
        }
        return `https://${sanitizedFilePath}`;
      }

      for (const [oldDomain, newDomain] of Object.entries(CLOUDIMG_DOMAIN_MAPPING)) {
        if (sanitizedFilePath.includes(oldDomain)) {
          sanitizedFilePath = sanitizedFilePath.replace(oldDomain, newDomain);
          const urlParams = buildUrl(sanitizedFilePath, width, height);
          if (urlParams) {
            return `https://${sanitizedFilePath}?${urlParams}`;
          } else {
            return `https://${sanitizedFilePath}`;
          }
        }
      }

      return fullMatch;
    });
  }

  return inputString;
};

module.exports = replaceCloudImgURLs;
//https://s3-us-west-2.amazonaws.com/imageserver.prod/d63e4af2-f644-11ec-b686-12565309935d/shark2.png
