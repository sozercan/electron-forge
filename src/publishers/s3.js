import AWS from 'aws-sdk';
import debug from 'debug';
import path from 'path';
import s3 from 's3';

import asyncOra from '../util/ora-handler';

const d = debug('electron-forge:publish:s3');

AWS.util.update(AWS.S3.prototype, {
  addExpect100Continue: function addExpect100Continue() {
    // Hack around large upload issue: https://github.com/andrewrk/node-s3-client/issues/74
  },
});

export default async (artifacts, packageJSON, forgeConfig, authToken, tag) => {
  const s3Config = forgeConfig.s3;
  s3Config.secretAccessKey = s3Config.secretAccessKey || authToken;
  if (!(s3Config.accessKeyId && s3Config.secret && s3Config.bucket)) {
    throw 'In order to publish to s3 you must set the "s3.accessKeyId", "process.env.ELECTRON_FORGE_S3_SECRET_ACCESS_KEY" and "s3.bucket" properties in your forge config. See the docs for more info'; // eslint-disable-line
  }

  d('creating s3 client with options:', s3Config);

  const client = s3.createClient({
    s3Client: new AWS.S3({
      accessKeyId: s3Config.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: s3Config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
    }),
  });
  client.s3.addExpect100Continue = () => {};

  const folder = s3Config.folder || tag || packageJSON.version;

  let uploaded = 0;
  await asyncOra(`Uploading Artifacts ${uploaded}/${artifacts.length}`, async (uploadSpinner) => {
    const updateSpinner = () => {
      uploadSpinner.text = `Uploading Artifacts ${uploaded}/${artifacts.length}`; // eslint-disable-line
    };

    await Promise.all(artifacts.map(artifactPath =>
      new Promise(async (resolve, reject) => {
        const done = (err) => {
          if (err) return reject(err);
          uploaded += 1;
          updateSpinner();
          resolve();
        };

        const uploader = client.uploadFile({
          localFile: artifactPath,
          s3Params: {
            Bucket: s3Config.bucket,
            Key: `${folder}/${path.basename(artifactPath)}`,
            ACL: s3Config.public ? 'public-read' : 'private',
          },
        });
        d('uploading:', artifactPath);

        uploader.on('error', err => done(err));
        uploader.on('progress', () => {
          d(`Upload Progress (${path.basename(artifactPath)}) ${Math.round((uploader.progressAmount / uploader.progressTotal) * 100)}%`);
        });
        uploader.on('end', () => done());
      })
    ));
  });
};
