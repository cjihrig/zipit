'use strict';

const Fs = require('fs');
const Path = require('path');
const Insync = require('insync');
const Zip = require('jszip');


module.exports = function zip (options, callback) {
  const inputs = [].concat(options.input);
  const zip = new Zip();
  const cwd = options.cwd || process.cwd();

  Insync.each(inputs, function inputIterator (input, next) {
    if (typeof input === 'string') {
      return addFile(Path.resolve(cwd, input), zip, next);
    }

    if (input !== null && typeof input === 'object') {
      zip.file(input.name, input.data);
      return next();
    }

    next(new TypeError(`input must be a string or object, but got ${input}`));
  }, function inputCb (err) {
    if (err) {
      return callback(err);
    }

    zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      platform: process.platform
    }).then(function zipCb (zipData) {
      callback(null, zipData);
    }).catch(function zipCatch (err) {
      callback(err);
    });
  });
};


function addFile (file, zip, callback) {
  Fs.stat(file, function statCb (err, stats) {
    if (err) {
      return callback(err);
    }

    const basename = Path.basename(file);

    if (stats.isFile()) {
      return Fs.readFile(file, function readCb (err, data) {
        if (err) {
          return callback(err);
        }

        zip.file(basename, data);
        callback();
      });
    }

    if (stats.isDirectory()) {
      return Fs.readdir(file, function readdirCb (err, files) {
        if (err) {
          return callback(err);
        }

        const dir = zip.folder(basename);

        Insync.each(files, function dirIterator (dirEntry, cb) {
          addFile(Path.join(file, dirEntry), dir, cb);
        }, callback);
      });
    }

    callback();
  });
}
