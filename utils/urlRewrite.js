// TODO revisit the original script see if we've any missing cases

// Array of cloudimg domains to replace
const CLOUDIMG_DOMAINS = [
  'https://alnnibitpo.cloudimg.io/v7/',
  'https://alnnibitpo.cloudimg.io/',
  'https://czi3m2qn.cloudimg.io/cdn/n/n/',
  'https://acbbesnfco.cloudimg.io/v7',
  'https://czi3m2qn.cloudimg.io/',
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

const IMGIX_DOMAINS = [
  'https://buildfire-proxy.imgix.net/cdn/',
  'https://buildfire.imgix.net/',
  'https://bfplugins.imgix.net/',
  'https://bflegacy.imgix.net/',
  'https://buildfire-uat.imgix.net/',
  'https://bfplugins-uat.imgix.net/',

];

const removeImgixDomainsFromUrl = (inputString) => {
    for (const domain of IMGIX_DOMAINS) {
      const parts = inputString.split(domain);
      if (parts.length == 2) {
        inputString = parts[parts.length - 1];
        break;
      }
    }
  return inputString;
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

const safeDecode = (url) => {
  try {
    return decodeURIComponent(url);
  } catch (e) {
    return url;
  }
};

const sanitizeUrl = url => url.trim();

const sanitizesUrlQuery = (url) => {
  
  url = url.replace(/[?&]func=bound(&|$)/, (match, p1) => {
    return p1 === '&' ? '?' : '';
  }).replace(/\?$/, '');
  
  let lastWidth = null;
  let lastHeight = null;
  
  const widthIndex = url.lastIndexOf('width=');
  if (widthIndex !== -1) {
    const rest = url.substring(widthIndex + 6);
    const end = rest.search(/&|$|\?/);
    lastWidth = rest.substring(0, end === -1 ? rest.length : end);
  }
  
  const heightIndex = url.lastIndexOf('height=');
  if (heightIndex !== -1) {
    const rest = url.substring(heightIndex + 7);
    const end = rest.search(/&|$|\?/);
    lastHeight = rest.substring(0, end === -1 ? rest.length : end);
  }
  
  const urlObj = new URL(url.split('?')[0]);
  const params = urlObj.searchParams;
  
  const fitValue = params.get('fit');
  
  const paramsToRemove = Array.from(params.keys());
  paramsToRemove.forEach(param => params.delete(param));
  
  if (fitValue) params.set('fit', fitValue);
  
  if (lastWidth) params.set('width', lastWidth);
  if (lastHeight) params.set('height', lastHeight);
  
  return normalizeUrl(urlObj.toString());
};

const normalizeUrl = (url) => {
  try {
    const parsed = new URL(url);
    
    const encodedPath = parsed.pathname
      .split('/')
      .map(segment => encodeURIComponent(decodeURIComponent(segment)))
      .join('/');
    
    const encodedQuery = parsed.searchParams.toString();
    
    return `${parsed.protocol}//${parsed.host}${encodedPath}${encodedQuery ? '?' + encodedQuery : ''}`;
  } catch (e) {
    return url;
  }
};


const replaceCloudImgURLs = (inputString) => {
  if (inputString.startsWith('https')) {
    inputString = inputString.replace(/https:\/(?!\/)/gi, 'https://'); // for bad urls with one '/', ex: https:/s3.amazonaws.com/...
    inputString = removeImgixDomainsFromUrl(inputString);
    inputString = safeDecode(inputString);
    inputString = inputString.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
  }
  
  return inputString.replace(/https:\/\/[a-z0-9.-]*cloudimg\.io[^\s"')<>]+/gi, match => {
    
    let cleanedUrl = safeDecode(match); // decode again for the images in the wysiwyg
    cleanedUrl = cleanedUrl.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
    cleanedUrl = cleanedUrl.replace(/amp;/g, '');
    cleanedUrl = removeDuplicateCloudImgWrappers(cleanedUrl);
    cleanedUrl = cleanedUrl.replace(/https:\/(?!\/)/gi, 'https://');
    
    
    
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
        regex: /https:\/\/([a-z0-9]+)\.cloudimg\.io(\/.*)?\/https:\/\/([^"\s]+)/i,
        buildUrl: () => ''
      }
    ];
    
    cleanedUrl = cleanedUrl.replace(/([?&])func=crop\b/, '$1fit=crop');
    
    let foundMapping = false;
    
    
    
    for (const { regex, buildUrl } of patterns) {
      if (regex.test(cleanedUrl)) {
        const matchParts = regex.exec(cleanedUrl);
        let width, height, sanitizedFilePath;
        
        if (regex.toString().includes('bound') || regex.toString().includes('crop')) {
          width = matchParts[2];
          height = matchParts[3];
          sanitizedFilePath = sanitizeUrl(matchParts[4]);
        } else if (regex.toString().includes('width')) {
          width = matchParts[2];
          sanitizedFilePath = sanitizeUrl(matchParts[3]);
        } else {
          sanitizedFilePath = sanitizeUrl(matchParts[3] || matchParts[4]);
        }
        
        if (sanitizedFilePath.includes('images.unsplash.com')) {
          return `https://${sanitizedFilePath}`;
        }
        
        for (const [oldDomain, newDomain] of Object.entries(CLOUDIMG_DOMAIN_MAPPING)) {
          if (sanitizedFilePath.includes(oldDomain)) {
            foundMapping = true;
            sanitizedFilePath = sanitizedFilePath.replace(oldDomain, newDomain);
            
            const params = [];
            if (width) params.push(`width=${width}`);
            if (height) params.push(`height=${height}`);
            
            if (params.length) {
              const [baseUrl, existingQuery] = sanitizedFilePath.split('?');
              const mergedQuery = existingQuery ? `${existingQuery}&${params.join('&')}` : params.join('&');
              return sanitizesUrlQuery(`https://${baseUrl}?${mergedQuery}`);
            }
            return sanitizesUrlQuery(`https://${sanitizedFilePath}`);
          }
        }
        
        if (!foundMapping) {
          let urlToEncode = `https://${sanitizedFilePath}`;
          let [base, query] = urlToEncode.split('?');
          
          if (!query) {
            const params = [];
            if (width) params.push(`width=${width}`);
            if (height) params.push(`height=${height}`);
            if (params.length) {
              query = params.join('&');
            }
          }
          
          const encodedBase = encodeURIComponent(base);
          return sanitizesUrlQuery(`${DEFAULT_IMGIX_DOMAIN}${encodedBase}${query ? '?' + query : ''}`);
        }
        
      }
    }
    
    return sanitizesUrlQuery(cleanedUrl);
  });
};


module.exports = replaceCloudImgURLs;