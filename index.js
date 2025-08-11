const {connect, getDB } = require("./db");
const logger = require('./logger');
const replaceCloudImgURLs = require('./utils/urlRewrite');
const APP_IDS = require('./appIds');
const fs = require('fs');
const path = require('path');
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
      
      const setObj = {};
      
      for (const { path, url } of cloudImagePaths) {
        const newUrl = replaceCloudImgURLs(url);
        if (newUrl !== url) {
          setObj[`data.${path}`] = newUrl;
        }
      }
      
      setObj[`cloudImageMigrated`] = true;

        bulkOps.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: setObj }
          }
        });
        stats.totalProcessed++;
    }
  }
  
  if (bulkOps.length > 0) {
    await db.collection(collectionName).bulkWrite(bulkOps); // 16 mb OR 100,000
    stats.successCount += bulkOps.length;
  }
  
  return stats;
};

const processAppForCollection = async (db, collectionName, appId) => {
  const totalRecords = await db.collection(collectionName).countDocuments({ appId, cloudImageMigrated: null });
  console.log(`Total records for app ${appId}: ${totalRecords}`);
  
  let lastId = null;
  let hasMore = true;
  const stats = {
    totalProcessed: 0,
    successCount: 0,
    failedCount: 0
  };
  
  while (hasMore) {
    const query = { appId, cloudImageMigrated: null };
    if (lastId) {
      query._id = { $gt: lastId };
    }
    
    const batch = await db.collection(collectionName)
      .find(query)
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .toArray();
    
    if (batch.length === 0) {
      hasMore = false;
      continue;
    }
    
    await processBatch(batch, appId, stats, db, collectionName);
    
    lastId = batch[batch.length - 1]._id;
    
    const percentage = ((stats.totalProcessed / totalRecords) * 100).toFixed(2);
    console.log(`Processed until now for app ${appId} [${collectionName}]: ${stats.totalProcessed}`);
    console.log(`${new Date().toISOString()} Processed batch for app ${appId}, collection ${collectionName}: ${batch.length} records`);
    console.log(`Progress for app ${appId}: ${percentage}%`);
  }
  
  console.log(`✅ [${collectionName}] Finished app: ${appId}`);
  return {
    status: 'completed',
    stats
  };
};

const processAllAppsSequentially = async (db) => {
  const results = {};

  for (const appId of APP_IDS) {
    console.log(`🚀 Starting app: ${appId}`);

    const collections = [process.env.userDataCollection, process.env.pluginDataCollection];
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
    downloadResultFile(results);

    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    logger.error(`❌ Migration failed: ${err.message || err.toString()}`);
    process.exit(1);
  }
})();


const downloadResultFile = (results)=> {

  const csvRows = [
    'AppId,Collection,Status,TotalProcessed,SuccessfulUpdates,FailedUpdates,Error'
  ];
  for (const [appId, appResult] of Object.entries(results)) {
    for (const [collectionName, result] of Object.entries(appResult)) {
      csvRows.push([
        appId,
        collectionName,
        result.status,
        result.stats.totalProcessed,
        result.stats.successCount,
        result.stats.failedCount,
        result.error ? `"${result.error.replace(/"/g, '""')}"` : ''
      ].join(','));
    }
  }
  fs.writeFileSync(path.join(__dirname, 'migration_results.csv'), csvRows.join('\n'));
}