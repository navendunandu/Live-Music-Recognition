const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const request = require('request');
const multer = require('multer'); // For handling file uploads
const cors = require("cors")

// Initialize Express app
const app = express();
const port = 5000;
app.use(cors())

// Setup file upload using multer
const upload = multer({ dest: 'uploads/' }); // Files will be stored in the 'uploads' folder

// Replace with your ACRCloud credentials
const defaultOptions = {
  host: 'identify-ap-southeast-1.acrcloud.com', // Change if using a different region
  endpoint: '/v1/identify',
  signature_version: '1',
  data_type: 'audio',
  secure: true,
  access_key: 'f325f02bbcf39f2416ffb61cddb03ade', // Replace with your access key
  access_secret: 'rPsjcVPuse64YlebxMhkXs5GUJaUsywa7nvAsk4V', // Replace with your access secret
};

function buildStringToSign(method, uri, accessKey, dataType, signatureVersion, timestamp) {
  return [method, uri, accessKey, dataType, signatureVersion, timestamp].join('\n');
}

function sign(signString, accessSecret) {
  return crypto.createHmac('sha1', accessSecret)
    .update(Buffer.from(signString, 'utf-8'))
    .digest().toString('base64');
}

// Identify function to handle the identification request
function identify(data, options, cb) {
  const currentData = new Date();
  const timestamp = Math.floor(currentData.getTime() / 1000); // Current timestamp in seconds

  const stringToSign = buildStringToSign('POST',
    options.endpoint,
    options.access_key,
    options.data_type,
    options.signature_version,
    timestamp);

  const signature = sign(stringToSign, options.access_secret);

  const formData = {
    sample: data,
    access_key: options.access_key,
    data_type: options.data_type,
    signature_version: options.signature_version,
    signature: signature,
    sample_bytes: data.length,
    timestamp: timestamp,
  };

  request.post({
    url: `http://${options.host}${options.endpoint}`,
    method: 'POST',
    formData: formData
  }, cb);
}

// Route to handle the audio upload and identification
app.post('/identify', upload.single('audio'), (req, res) => {
  if (!req.file) {
    return res.status(400).send({ message: 'Please upload an audio file.' });
  }
console.log(req.file);

  // Read the uploaded audio file
  const filePath = req.file.path;
  const bitmap = fs.readFileSync(filePath);

  // Call the identify function to send the audio to ACRCloud API
  identify(Buffer.from(bitmap), defaultOptions, function (err, httpResponse, body) {
    if (err) {
      return res.status(500).send({ error: err });
    }

    // Return the ACRCloud response
    res.json(JSON.parse(body));
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
