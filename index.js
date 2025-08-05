const {connect, getDB } = require("./db");
const logger = require('./logger');
const replaceCloudImgURLs = require('./utils/urlRewrite');
const APP_IDS = require('./AppIds');

const BATCH_SIZE = Number(process.env.BATCH_SIZE);
const STOP_ON_FAILURE = process.env.STOP_ON_FAILURE;
const COLLECTION_NAME = process.env.COLLECTION_NAME;


function findCloudImagePaths(obj, path = '') {
  const results = [];

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const newPath = path ? `${path}.${index}` : `${index}`;
      results.push(...findCloudImagePaths(item, newPath));
    });
  } else if (typeof obj === 'object' && obj !== null) {
    for (const key in obj) {
      const newPath = path ? `${path}.${key}` : key;
      results.push(...findCloudImagePaths(obj[key], newPath));
    }
  } else if (typeof obj === 'string' && obj.includes('cloudimg.io')) {
    results.push({
      path,
      url: obj,
    });
  }
  return results;
}

const processBatch = async function (docs, appId, stats, db) {
  const bulkOps = [];

  for (const doc of docs) {
    if (doc && doc.data) {
      const cloudImagePaths = findCloudImagePaths(doc.data);
      if (cloudImagePaths.length > 0) {
        stats.totalProcessed++;

        const setObj = {};
        for (const { path, url } of cloudImagePaths) {
          const newUrl = replaceCloudImgURLs(url);
          if (newUrl !== url) {
            setObj[`data.${path}`] = newUrl;
          }
        }

        if (Object.keys(setObj).length > 0) {
          bulkOps.push({
            updateOne: {
              filter: { _id: doc._id },
              update: { $set: setObj }
            }
          });
          stats.successCount++;
        } else {
          stats.successCount++;
        }
      }
    }
  }

  try {
    if (bulkOps.length > 0) {
      await db.collection(COLLECTION_NAME).bulkWrite(bulkOps);
    }
  } catch (e) {
    console.log(`App ${appId} - Bulk write error: ${e}`);
    stats.failedCount += bulkOps.length;
    if (STOP_ON_FAILURE) {
      throw new Error(`Processing stopped due to error in app ${appId}`);
    }
  }

  return stats;
};

const processAllApps = async function(db) {
  const results = {};

  for(const appId of APP_IDS) {
   console.log(`Starting processing for app: ${appId}`);
    const totalRecords = await db.collection(COLLECTION_NAME).count({ appId: appId });
   console.log(`Total records for app ${appId}: ${totalRecords}`);

    let skip = 0;
    let hasMore = true;
    const stats = {
      totalProcessed: 0,
      successCount: 0,
      failedCount: 0
    };

    try {
      while(hasMore) {
        const batch = await db.collection(COLLECTION_NAME)
          .find({appId})
          .skip(skip)
          .limit(BATCH_SIZE)
          .toArray();


        if(batch.length === 0) {
          hasMore = false;
          continue;
        }

        const percentageDone = ((skip + batch.length) / totalRecords * 100).toFixed(2);
        console.log(`Processing batch of ${batch.length} documents (skip: ${skip}, ${percentageDone}% done) for appId ${appId}`);
        await processBatch(batch, appId, stats, db);

        skip += BATCH_SIZE;
      }

      results[appId] = {
        status: 'completed',
        stats: stats
      };

    } catch(e) {
      console.log(`Failed processing app ${appId}: ${e}`);
      logger.error(`❌ Failed to fetch users batch: ${e.stack}`);
      results[appId] = {
        status: 'failed',
        error: e.message,
        stats: stats
      };

      if(STOP_ON_FAILURE) {
        break;
      }
    }
  }

  console.log('======= FINAL SUMMARY =======');
  for(const [appId, result] of Object.entries(results)) {
    console.log(`App: ${appId}`);
    console.log(`Status: ${result.status}`);
    console.log(`Total Processed: ${result.stats.totalProcessed}`);
    console.log(`Successful Updates: ${result.stats.successCount}`);
    console.log(`Failed Updates: ${result.stats.failedCount}`);
    if(result.error) {
      console.log(`Error: ${result.error}`);
    }
  }
};


(async () => {
  try {
    await connect();
    const db = getDB();
    await processAllApps(db);
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
})();
