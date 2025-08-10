const {connect, getDB } = require("./db");
const logger = require('./logger');
const replaceCloudImgURLs = require('./utils/urlRewrite');
const APP_IDS = require('./AppIds');
const BATCH_SIZE = Number(process.env.BATCH_SIZE);
const STOP_ON_FAILURE = process.env.STOP_ON_FAILURE;

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


const processBatch = async function (docs, appId, stats, db, collectionName) {
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
        }
      }
    }
  }

  try {
    if (bulkOps.length > 0) {

      await db.collection(collectionName).bulkWrite(bulkOps);
      stats.successCount+= bulkOps.length;
    }
  } catch (e) {
    console.error(`App ${appId} - Bulk write error in ${collectionName}: ${e}`);
    logger.error(`❌ Bulk write failed for ${collectionName} - App ${appId}: ${e.stack}`);
    stats.failedCount += bulkOps.length;

    if (STOP_ON_FAILURE) {
      throw new Error(`Stopping due to failure in ${collectionName} for app ${appId}`);
    }
  }

  return stats;
};

const processAppForCollection = async (db, collectionName, appId) => {
  const totalRecords = await db.collection(collectionName).count({ appId });
  console.log(`Total records for app ${appId}: ${totalRecords}`);


  let skip = 0;
  let hasMore = true;
  const stats = {
    totalProcessed: 0,
    successCount: 0,
    failedCount: 0
  };

  try {
    while (hasMore) {
      const batch = await db.collection(collectionName)
        .find({ appId })
        .skip(skip)
        .limit(BATCH_SIZE)
        .toArray();

      if (batch.length === 0) {
        hasMore = false;
        continue;
      }


      await processBatch(batch, appId, stats, db, collectionName);
      const now = new Date()
      console.log(`${now.toISOString()} Processed batch for app ${appId}, collection ${collectionName}: ${batch.length} records`);
      skip += batch.length;

      const percentage = ((skip / totalRecords) * 100).toFixed(2);
      console.log(`Progress for app ${appId}: ${percentage}%`);
    }
    console.log(`✅ [${collectionName}] Finished app: ${appId}`);
    return {
      status: 'completed',
      stats
    };

  } catch (e) {
    console.error(`❌ [${collectionName}] Failed app: ${appId}: ${e}`);
    return {
      status: 'failed',
      error: e.message,
      stats
    };
  }
};

const processAllAppsSequentially = async (db) => {
  const results = {};

  for (const appId of APP_IDS) {
    console.log(`🚀 Starting app: ${appId}`);

    const collections = ['userDataClonedBlw'];
    results[appId] = {};

    for (const collectionName of collections) {
      console.log(`→ Processing collection: ${collectionName}`);

      try {
        const result = await processAppForCollection(db, collectionName, appId);
        results[appId][collectionName] = result;

        if (result.status === 'failed' && STOP_ON_FAILURE) {
          console.log(`🛑 Stopping because of failure on ${appId} - ${collectionName}`);
          return results;
        }
      } catch (e) {
        console.error(`❌ Unexpected error processing ${appId} - ${collectionName}:`, e);
        results[appId][collectionName] = {
          status: 'failed',
          error: e.message || e.toString(),
          stats: {}
        };

        if (STOP_ON_FAILURE) {
          console.log(`🛑 Stopping due to unexpected error on ${appId} - ${collectionName}`);
          return results;
        }
      }
    }
  }

  return results;
};


(async () => {
  try {
    const startTime = new Date();
    console.log(`🚀 Migration started at: ${startTime.toISOString()}`);

    await connect();
    const db = getDB();

    const results = await processAllAppsSequentially(db);


    const endTime = new Date();
    console.log(`✅ Migration completed at: ${endTime.toISOString()}`);

    const duration = (endTime - startTime) / 1000;
    console.log(`⏱️ Total migration time: ${(duration / 60).toFixed(2)} minutes`);
    console.log('\n======= FINAL SUMMARY =======');
    for (const [appId, appResult] of Object.entries(results)) {
      console.log(`App: ${appId}`);
      for (const [collectionName, result] of Object.entries(appResult)) {
        console.log(` -Collection: ${collectionName}`);
        console.log(`Status: ${result.status}`);
        console.log(` Total Processed: ${result.stats.totalProcessed}`);
        console.log(`Successful Updates: ${result.stats.successCount}`);
        console.log(`Failed Updates: ${result.stats.failedCount}`);
        if (result.error) {
          console.log(`    Error: ${result.error}`);
        }
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    logger.error(`❌ Migration failed: ${err.message || err.toString()}`);
    process.exit(1);
  }
})();
