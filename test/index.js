'use strict';
const Assert = require('assert');
const Fs = require('fs');
const Path = require('path');
const Barrier = require('cb-barrier');
const Lab = require('@hapi/lab');
const StandIn = require('stand-in');
const Unzip = require('yauzl');
const Zip = require('yazl');
const Zipit = require('../lib');
const { describe, it } = exports.lab = Lab.script();
const fixturesDirectory = Path.join(__dirname, 'fixtures');


function unzip (buffer, callback) {
  const result = { files: {} };

  Unzip.fromBuffer(buffer, (err, zip) => {
    if (err) {
      return callback(err);
    }

    zip.on('error', function onError (err) {
      zip.close();
      callback(err);
    });

    zip.on('end', function onEnd () {
      zip.close();
    });

    if (zip.entryCount === 0) {
      return callback(null, result);
    }

    let processed = 0;

    zip.on('entry', function onEntry (entry) {
      zip.openReadStream(entry, (err, stream) => {
        if (err) {
          return callback(err);
        }

        const chunks = [];
        let outputSize = 0;

        stream.on('error', (err) => {
          callback(err);
        });

        stream.on('data', (chunk) => {
          outputSize += chunk.length;
          chunks.push(chunk);
        });

        stream.on('finish', () => {
          const output = Buffer.concat(chunks, outputSize);

          result.files[entry.fileName] = {
            entry,
            name: entry.fileName,
            mode: ((entry.externalFileAttributes >> 16) & 0xfff).toString(8),
            _asBuffer: output
          };

          processed++;

          if (processed >= zip.entryCount) {
            callback(null, result);
          }
        });
      });
    });
  });
}


describe('Zipit', () => {
  it('creates a zip from a single filename', () => {
    const input = Path.join(fixturesDirectory, 'file.js');
    const barrier = new Barrier();

    Zipit({
      input,
      cwd: fixturesDirectory
    }, (err, buffer) => {
      Assert.strictEqual(err, null);
      Assert(buffer instanceof Buffer);

      unzip(buffer, (err, zip) => {
        Assert.strictEqual(err, null);

        const file = zip.files['file.js'];

        Assert.deepStrictEqual(Object.keys(zip.files), ['file.js']);
        Assert(typeof file === 'object' && file !== null);
        Assert.strictEqual(file.name, 'file.js');
        Assert.deepStrictEqual(file._asBuffer, Fs.readFileSync(input));
        barrier.pass();
      });
    });

    return barrier;
  });

  it('creates a zip from a directory name', () => {
    const barrier = new Barrier();

    Zipit({
      input: Path.join(fixturesDirectory, 'directory'),
      cwd: fixturesDirectory
    }, (err, buffer) => {
      Assert.strictEqual(err, null);
      Assert(buffer instanceof Buffer);

      unzip(buffer, (err, zip, data) => {
        Assert.strictEqual(err, null);

        const dir = zip.files['directory/'];
        const subdir = zip.files['directory/subdirectory/'];
        const dirFile = zip.files['directory/dir-file.js'];
        const subdirFile = zip.files['directory/subdirectory/subdir-file.js'];

        Assert.strictEqual(Object.keys(zip.files).length, 4);

        Assert(typeof dir === 'object' && dir !== null);
        Assert.strictEqual(dir.name, 'directory/');

        Assert(typeof subdir === 'object' && subdir !== null);
        Assert.strictEqual(subdir.name, 'directory/subdirectory/');

        Assert(typeof dirFile === 'object' && dirFile !== null);
        Assert.strictEqual(dirFile.name, 'directory/dir-file.js');
        Assert.deepStrictEqual(dirFile._asBuffer,
          Fs.readFileSync(Path.join(fixturesDirectory, 'directory', 'dir-file.js')));

        Assert(typeof subdirFile === 'object' && subdirFile !== null);
        Assert.strictEqual(subdirFile.name, 'directory/subdirectory/subdir-file.js');
        Assert.deepStrictEqual(subdirFile._asBuffer,
          Fs.readFileSync(Path.join(fixturesDirectory, 'directory', 'subdirectory', 'subdir-file.js')));

        barrier.pass();
      });
    });

    return barrier;
  });

  it('creates a zip from a file and directory', () => {
    const barrier = new Barrier();

    Zipit({
      input: [
        Path.join(fixturesDirectory, 'file.js'),
        Path.join(fixturesDirectory, 'directory')
      ],
      cwd: fixturesDirectory
    }, (err, buffer) => {
      Assert.strictEqual(err, null);
      Assert(buffer instanceof Buffer);

      unzip(buffer, (err, zip, data) => {
        Assert.strictEqual(err, null);

        const file = zip.files['file.js'];
        const dir = zip.files['directory/'];
        const subdir = zip.files['directory/subdirectory/'];
        const dirFile = zip.files['directory/dir-file.js'];
        const subdirFile = zip.files['directory/subdirectory/subdir-file.js'];

        Assert.strictEqual(Object.keys(zip.files).length, 5);

        Assert(typeof file === 'object' && file !== null);
        Assert.strictEqual(file.name, 'file.js');
        Assert.deepStrictEqual(file._asBuffer,
          Fs.readFileSync(Path.join(fixturesDirectory, 'file.js')));

        Assert(typeof dir === 'object' && dir !== null);
        Assert.strictEqual(dir.name, 'directory/');

        Assert(typeof subdir === 'object' && subdir !== null);
        Assert.strictEqual(subdir.name, 'directory/subdirectory/');

        Assert(typeof dirFile === 'object' && dirFile !== null);
        Assert.strictEqual(dirFile.name, 'directory/dir-file.js');
        Assert.deepStrictEqual(dirFile._asBuffer,
          Fs.readFileSync(Path.join(fixturesDirectory, 'directory', 'dir-file.js')));

        Assert(typeof subdirFile === 'object' && subdirFile !== null);
        Assert.strictEqual(subdirFile.name, 'directory/subdirectory/subdir-file.js');
        Assert.deepStrictEqual(subdirFile._asBuffer,
          Fs.readFileSync(Path.join(fixturesDirectory, 'directory', 'subdirectory', 'subdir-file.js')));

        barrier.pass();
      });
    });

    return barrier;
  });

  it('creates a zip from inline data', () => {
    const barrier = new Barrier();

    Zipit({
      input: [
        { name: 'abc.ini', data: Buffer.from('foo-bar-baz') },
        { name: 'xyz.txt', data: 'blah-blah-blah' }
      ]
    }, (err, buffer) => {
      Assert.strictEqual(err, null);
      Assert(buffer instanceof Buffer);

      unzip(buffer, (err, zip, data) => {
        Assert.strictEqual(err, null);

        Assert.strictEqual(Object.keys(zip.files).length, 2);

        const file1 = zip.files['abc.ini'];
        const file2 = zip.files['xyz.txt'];

        Assert(typeof file1 === 'object' && file1 !== null);
        Assert.strictEqual(file1.name, 'abc.ini');
        Assert.deepStrictEqual(file1._asBuffer, Buffer.from('foo-bar-baz'));
        Assert.strictEqual(file1.mode, '755');

        Assert(typeof file2 === 'object' && file2 !== null);
        Assert.strictEqual(file2.name, 'xyz.txt');

        Assert.deepStrictEqual(file2._asBuffer, Buffer.from('blah-blah-blah'));
        Assert.strictEqual(file2.mode, '755');

        barrier.pass();
      });
    });

    return barrier;
  });

  it('handles errors during zip creation', () => {
    const barrier = new Barrier();
    const input = Path.join(fixturesDirectory, 'file.js');
    const error = new Error('foo');

    StandIn.replace(Zip.ZipFile.prototype, 'end', function end () {
      this.outputStream.emit('error', error);
    }, { stopAfter: 1 });

    Zipit({
      input,
      cwd: fixturesDirectory
    }, (err, buffer) => {
      Assert.strictEqual(err, error);
      Assert.strictEqual(buffer, undefined);
      barrier.pass();
    });

    return barrier;
  });

  it('handles fs.stat() errors', () => {
    const barrier = new Barrier();
    const input = Path.join(fixturesDirectory, 'file.js');
    const error = new Error('foo');

    StandIn.replace(Fs, 'stat', (stand, file, callback) => {
      callback(error);
    }, { stopAfter: 1 });

    Zipit({
      input,
      cwd: fixturesDirectory
    }, (err, buffer) => {
      Assert.strictEqual(err, error);
      Assert.strictEqual(buffer, undefined);
      barrier.pass();
    });

    return barrier;
  });

  it('ignores things that are not files or directories', () => {
    const barrier = new Barrier();
    const input = Path.join(fixturesDirectory, 'file.js');

    StandIn.replace(Fs, 'stat', (stand, file, callback) => {
      callback(null, {
        isFile () { return false; },
        isDirectory () { return false; }
      });
    }, { stopAfter: 1 });

    Zipit({
      input,
      cwd: fixturesDirectory
    }, (err, buffer) => {
      Assert.strictEqual(err, null);
      Assert(buffer instanceof Buffer);

      unzip(buffer, (err, zip, data) => {
        Assert.strictEqual(err, null);
        Assert.strictEqual(Object.keys(zip.files).length, 0);
        barrier.pass();
      });
    });

    return barrier;
  });

  it('handles fs.readdir() errors', () => {
    const barrier = new Barrier();
    const input = Path.join(fixturesDirectory, 'directory');
    const error = new Error('foo');

    StandIn.replace(Fs, 'readdir', (stand, dir, callback) => {
      callback(error);
    }, { stopAfter: 1 });

    Zipit({
      input,
      cwd: fixturesDirectory
    }, (err, buffer) => {
      Assert.strictEqual(err, error);
      Assert.strictEqual(buffer, undefined);
      barrier.pass();
    });

    return barrier;
  });

  it('calls back with an error on invalid input', () => {
    const barrier = new Barrier();

    function fail (input, callback) {
      Zipit({ input }, (err, buffer) => {
        Assert(err instanceof TypeError);
        Assert(/input must be a string or object, but got/.test(err.message));
        Assert.strictEqual(buffer, undefined);
        callback();
      });
    }

    fail(undefined, () => {
      fail(null, () => {
        fail(123, () => {
          fail(true, barrier.pass);
        });
      });
    });

    return barrier;
  });

  it('works with relative paths', () => {
    const barrier = new Barrier();
    const input = './test/fixtures/file.js';

    Zipit({ input }, (err, buffer) => {
      Assert.strictEqual(err, null);
      Assert(buffer instanceof Buffer);

      unzip(buffer, (err, zip, data) => {
        Assert.strictEqual(err, null);

        const file = zip.files['file.js'];

        Assert.deepStrictEqual(Object.keys(zip.files), ['file.js']);
        Assert(typeof file === 'object' && file !== null);
        Assert.strictEqual(file.name, 'file.js');
        Assert.deepStrictEqual(file._asBuffer, Fs.readFileSync(input));
        barrier.pass();
      });
    });

    return barrier;
  });
});
