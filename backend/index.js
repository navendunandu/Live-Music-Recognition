const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const request = require('request');
const multer = require('multer');
const SpotifyWebApi = require('spotify-web-api-node');
const cors = require("cors");

// Initialize Express app
const app = express();
const port = 5000;
app.use(cors());

// Setup file upload using multer
const upload = multer({ dest: 'uploads/' });

// ACRCloud credentials
const defaultOptions = {
  host: 'identify-ap-southeast-1.acrcloud.com',
  endpoint: '/v1/identify',
  signature_version: '1',
  data_type: 'audio',
  secure: true,
  access_key: 'f325f02bbcf39f2416ffb61cddb03ade',
  access_secret: 'rPsjcVPuse64YlebxMhkXs5GUJaUsywa7nvAsk4V',
};

// Spotify API credentials
const spotifyApi = new SpotifyWebApi({
  clientId: 'b112bd3214ce4ec591b8d88029d21b57',
  clientSecret: '7c23b523e5614b848d30d31fbd294aca',
});

// Enhanced Spotify authentication
async function authenticateSpotify() {
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body['access_token']);
    return true;
  } catch (err) {
    console.error('Spotify authentication failed:', err);
    throw err;
  }
}

// ACRCloud utility functions
function buildStringToSign(method, uri, accessKey, dataType, signatureVersion, timestamp) {
  return [method, uri, accessKey, dataType, signatureVersion, timestamp].join('\n');
}

function sign(signString, accessSecret) {
  return crypto.createHmac('sha1', accessSecret)
    .update(Buffer.from(signString, 'utf-8'))
    .digest().toString('base64');
}

function identify(data, options, cb) {
  const currentData = new Date();
  const timestamp = Math.floor(currentData.getTime() / 1000);

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

// Simplified function to get similar songs based on genre
async function getSimilarSongs(recognizedTrack) {
  try {
    // Extract genre and artist information
    const genre = recognizedTrack.genres[0]?.name || 'pop';
    const artistName = recognizedTrack.artists[0]?.name;
    
    // Create search query based on genre and exclude the original artist
    const searchQuery = `genre:${genre} NOT artist:"${artistName}"`;
    
    // Get popular tracks matching the genre
    const result = await spotifyApi.searchTracks(searchQuery, {
      limit: 5,
      market: 'US'
    });

    if (!result.body.tracks.items.length) {
      console.log('No tracks found for genre:', genre);
      return [];
    }

    // Format the results
    return result.body.tracks.items.map(track => ({
      name: track.name,
      artist: track.artists.map(artist => artist.name).join(', '),
      url: track.external_urls.spotify,
      album: track.album.name,
      cover_image: track.album.images[0]?.url,
      preview_url: track.preview_url,
      popularity: track.popularity,
      genre: genre
    }));

  } catch (err) {
    console.error('Error getting similar songs:', err);
    return [];
  }
}

// Enhanced route handler
app.post('/identify', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an audio file.' });
    }

    const filePath = req.file.path;
    const bitmap = fs.readFileSync(filePath);

    identify(Buffer.from(bitmap), defaultOptions, async function (err, httpResponse, body) {
      try {
        if (err) throw err;

        const recognitionResult = JSON.parse(body);

        if (recognitionResult.status.code === 0 && recognitionResult.metadata.music) {
          const recognizedTrack = recognitionResult.metadata.music[0];

          await authenticateSpotify();
          const similarSongs = await getSimilarSongs(recognizedTrack);

          // Clean up the uploaded file
          fs.unlink(filePath, (err) => {
            if (err) console.error('Error deleting file:', err);
          });

          res.json({
            recognized_song: recognizedTrack,
            similar_songs: similarSongs,
            genre_used: recognizedTrack.genres?.[0]?.name || 'pop'
          });
        } else {
          res.status(400).json({
            message: 'No song identified.',
            details: recognitionResult.status
          });
        }
      } catch (error) {
        console.error('Error processing recognition result:', error);
        res.status(500).json({ error: 'Failed to process recognition result' });
      }
    });
  } catch (error) {
    console.error('Error in /identify route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});