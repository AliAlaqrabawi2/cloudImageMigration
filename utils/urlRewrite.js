
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
  'bfplugins-uat.imgix.net': 'bfplugins-uat.imgix.net',
  'imagelibserver.s3.amazonaws.com': 'buildfire-uat.imgix.net',

  'd1q5x1plk9guz6.cloudfront.net': 'bfplugins-uat.imgix.net',
  'd3lkxgii6udy4q.cloudfront.net': 'bfplugins-uat.imgix.net',
  'd26kqod42fnsx0.cloudfront.net': 'bfplugins-uat.imgix.net',

  'pluginserver.buildfire.com': 'bfplugins.imgix.net',

};

const DEFAULT_IMGIX_DOMAIN = 'https://buildfire-proxy.imgix.net/cdn/';


const removeDuplicateCloudImgWrappers = function (inputString) {
  for (const domain of CLOUDIMG_DOMAINS) {

    const parts = inputString.split(domain);

    if (parts.length <= 2) continue;

    inputString = domain + parts[parts.length - 1];
  }

  return inputString;
};

const sanitizeUrl = url => url.trim();

const cleanFuncBound = (url) => {
  return url.replace(/[?&]func=bound(&|$)/, (match, p1) => {
    return p1 === '&' ? '?' : '';
  }).replace(/\?$/, '');
};


const replaceCloudImgURLs = (inputString) => {
  inputString = inputString.replace(/amp;/g, '')
  return inputString.replace(/https:\/\/[a-z0-9.-]*cloudimg\.io[^\s"')<>]+/gi, match => {
    let cleanedUrl = removeDuplicateCloudImgWrappers(match);

    const patterns = [
      {
        regex: /https:\/\/([a-z0-9]+)\.cloudimg\.io\/s\/width\/(\d+)\/https:\/\/([^"\s]+)/i,
        buildUrl: (filePath, width) => `width=${width}`
      },
      {
        regex: /https:\/\/([a-z0-9]+)\.cloudimg\.io\/bound\/(\d+)x(\d+)\/n\/https:\/\/([^"\s]+)/i,
        buildUrl: (filePath, width, height) => `width=${width}&height=${height}`
      },
      {
        regex: /https:\/\/([a-z0-9]+)\.cloudimg\.io\/crop\/(\d+)x(\d+)\/n\/https:\/\/([^"\s]+)/i,
        buildUrl: (filePath, width, height) => `func=crop&width=${width}&height=${height}`
      },
      {
        regex: /https:\/\/([a-z0-9]+)\.cloudimg\.io(\/[^\/]+)?\/https:\/\/([^"\s]+)/i,
        buildUrl: () => ''
      }
    ];

    cleanedUrl = cleanedUrl.replace(/([?&])func=crop\b/, '$1fit=crop');

    let foundMapping = false;

    for (const { regex, buildUrl } of patterns) {
      if (regex.test(cleanedUrl)) {
        const matchParts = regex.exec(cleanedUrl);
        let width, height, sanitizedFilePath, type = '';

        if (matchParts.length === 4) {
          sanitizedFilePath = sanitizeUrl(matchParts[3]);
        } else if (matchParts.length === 5) {
          width = matchParts[2];
          sanitizedFilePath = sanitizeUrl(matchParts[4]);
        } else {
          width = matchParts[2];
          height = matchParts[3];
          sanitizedFilePath = sanitizeUrl(matchParts[4]);
        }

        if (sanitizedFilePath.includes('images.unsplash.com')) {
          return `https://${sanitizedFilePath}`;
        }

        for (const [oldDomain, newDomain] of Object.entries(CLOUDIMG_DOMAIN_MAPPING)) {
          if (sanitizedFilePath.includes(oldDomain)) {
            foundMapping = true;
            sanitizedFilePath = sanitizedFilePath.replace(oldDomain, newDomain);
            const urlParams = buildUrl(sanitizedFilePath, width, height, type);
            if (urlParams) {
              const [baseUrl, existingQuery] = sanitizedFilePath.split('?');
              const mergedQuery = existingQuery ? `${existingQuery}&${urlParams}` : urlParams;
              return `https://${baseUrl}?${mergedQuery}`;
            }
            return cleanFuncBound(`https://${sanitizedFilePath}`);
          }
        }

        if (!foundMapping) {
          const urlToEncode = `https://${sanitizedFilePath}`;
          const [base, query] = urlToEncode.split('?');
          const encodedBase = encodeURIComponent(base);
          return cleanFuncBound(`${DEFAULT_IMGIX_DOMAIN}${encodedBase}${query ? '?' + query : ''}`);
        }
      }
    }

    return cleanFuncBound(cleanedUrl);
  });
};


module.exports = replaceCloudImgURLs;
