'use strict';

const Fs = require('fs');
const Path = require('path');
const Code = require('code');
const Insync = require('insync');
const Lab = require('lab');
const StandIn = require('stand-in');
const Zip = require('jszip');
const Zipit = require('../lib');

const lab = exports.lab = Lab.script();
const expect = Code.expect;
const describe = lab.describe;
const it = lab.it;

const fixturesDirectory = Path.join(__dirname, 'fixtures');


function unzip (buffer, callback) {
  Zip.loadAsync(buffer).then((zip) => {
    zip.generateAsync({
      type: 'nodebuffer',
      compression: 'STORE',
      platform: process.platform
    })
    .then((data) => {
      Insync.each(Object.keys(zip.files), (key, next) => {
        const file = zip.files[key];

        if (file.dir) {
          return next();
        }

        file.async('nodebuffer')
          .then((content) => {
            file._asBuffer = content;
            next();
          })
          .catch((err) => { next(err); });
      }, (err) => {
        callback(err, zip, data);
      });
    })
    .catch((err) => { callback(err); });
  });
}


describe('Zipit', () => {
  it('creates a zip from a single filename', (done) => {
    const input = Path.join(fixturesDirectory, 'file.js');

    Zipit({
      input,
      cwd: fixturesDirectory
    }, (err, buffer) => {
      expect(err).to.not.exist();
      expect(buffer).to.be.an.instanceOf(Buffer);

      unzip(buffer, (err, zip, data) => {
        expect(err).to.not.exist();

        const file = zip.files['file.js'];

        expect(Object.keys(zip.files).length).to.equal(1);
        expect(file).to.be.an.object();
        expect(file.name).to.equal('file.js');
        expect(file.dir).to.be.false();
        expect(file._asBuffer).to.equal(Fs.readFileSync(input));
        done();
      });
    });
  });

  it('creates a zip from a directory name', (done) => {
    Zipit({
      input: Path.join(fixturesDirectory, 'directory'),
      cwd: fixturesDirectory
    }, (err, buffer) => {
      expect(err).to.not.exist();
      expect(buffer).to.be.an.instanceOf(Buffer);

      unzip(buffer, (err, zip, data) => {
        expect(err).to.not.exist();

        const dir = zip.files['directory/'];
        const subdir = zip.files['directory/subdirectory/'];
        const dirFile = zip.files['directory/dir-file.js'];
        const subdirFile = zip.files['directory/subdirectory/subdir-file.js'];

        expect(Object.keys(zip.files).length).to.equal(4);

        expect(dir).to.be.an.object();
        expect(dir.name).to.equal('directory/');
        expect(dir.dir).to.be.true();

        expect(subdir).to.be.an.object();
        expect(subdir.name).to.equal('directory/subdirectory/');
        expect(subdir.dir).to.be.true();

        expect(dirFile).to.be.an.object();
        expect(dirFile.name).to.equal('directory/dir-file.js');
        expect(dirFile.dir).to.be.false();
        expect(dirFile._asBuffer).to.equal(Fs.readFileSync(
          Path.join(fixturesDirectory, 'directory', 'dir-file.js'))
        );

        expect(subdirFile).to.be.an.object();
        expect(subdirFile.name).to.equal('directory/subdirectory/subdir-file.js');
        expect(subdirFile.dir).to.be.false();
        expect(subdirFile._asBuffer).to.equal(Fs.readFileSync(
          Path.join(fixturesDirectory, 'directory', 'subdirectory', 'subdir-file.js'))
        );
        done();
      });
    });
  });

  it('creates a zip from inline data', (done) => {
    Zipit({
      input: [
        { name: 'abc.ini', data: new Buffer('foo-bar-baz') },
        { name: 'xyz.txt', data: 'blah-blah-blah' }
      ]
    }, (err, buffer) => {
      expect(err).to.not.exist();
      expect(buffer).to.be.an.instanceOf(Buffer);

      unzip(buffer, (err, zip, data) => {
        expect(err).to.not.exist();
        expect(Object.keys(zip.files).length).to.equal(2);

        const file1 = zip.files['abc.ini'];
        const file2 = zip.files['xyz.txt'];

        expect(file1).to.be.an.object();
        expect(file1.name).to.equal('abc.ini');
        expect(file1.dir).to.be.false();
        expect(file1._asBuffer).to.equal(new Buffer('foo-bar-baz'));

        expect(file2).to.be.an.object();
        expect(file2.name).to.equal('xyz.txt');
        expect(file2.dir).to.be.false();
        expect(file2._asBuffer).to.equal(new Buffer('blah-blah-blah'));
        done();
      });
    });
  });

  it('handles errors during zip creation', (done) => {
    const input = Path.join(fixturesDirectory, 'file.js');

    StandIn.replace(Zip.prototype, 'generateAsync', () => {
      return new Promise((resolve, reject) => {
        reject(new Error('foo'));
      });
    }, { stopAfter: 1 });

    Zipit({
      input,
      cwd: fixturesDirectory
    }, (err, buffer) => {
      expect(err).to.be.an.error('foo');
      expect(buffer).to.not.exist();
      done();
    });
  });

  it('handles fs.stat() errors', (done) => {
    const input = Path.join(fixturesDirectory, 'file.js');

    StandIn.replace(Fs, 'stat', (stand, file, callback) => {
      callback(new Error('foo'));
    }, { stopAfter: 1 });

    Zipit({
      input,
      cwd: fixturesDirectory
    }, (err, buffer) => {
      expect(err).to.be.an.error('foo');
      expect(buffer).to.not.exist();
      done();
    });
  });

  it('ignores things that are not files or directories', (done) => {
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
      expect(err).to.not.exist();
      expect(buffer).to.be.an.instanceOf(Buffer);

      unzip(buffer, (err, zip, data) => {
        expect(err).to.not.exist();
        expect(Object.keys(zip.files).length).to.equal(0);
        done();
      });
    });
  });

  it('handles fs.readFile() errors', (done) => {
    const input = Path.join(fixturesDirectory, 'file.js');

    StandIn.replace(Fs, 'readFile', (stand, file, callback) => {
      callback(new Error('foo'));
    }, { stopAfter: 1 });

    Zipit({
      input,
      cwd: fixturesDirectory
    }, (err, buffer) => {
      expect(err).to.be.an.error('foo');
      expect(buffer).to.not.exist();
      done();
    });
  });

  it('handles fs.readFile() errors', (done) => {
    const input = Path.join(fixturesDirectory, 'directory');

    StandIn.replace(Fs, 'readdir', (stand, dir, callback) => {
      callback(new Error('foo'));
    }, { stopAfter: 1 });

    Zipit({
      input,
      cwd: fixturesDirectory
    }, (err, buffer) => {
      expect(err).to.be.an.error('foo');
      expect(buffer).to.not.exist();
      done();
    });
  });

  it('calls back with an error on invalid input', (done) => {
    function fail (input, callback) {
      Zipit({ input }, (err, buffer) => {
        expect(err).to.be.an.error(TypeError, /input must be a string or object, but got/);
        expect(buffer).to.not.exist();
        callback();
      });
    }

    fail(undefined, () => {
      fail(null, () => {
        fail(123, () => {
          fail(true, done);
        });
      });
    });
  });

  it('works with relative paths', (done) => {
    const input = './test/fixtures/file.js';

    Zipit({ input }, (err, buffer) => {
      expect(err).to.not.exist();
      expect(buffer).to.be.an.instanceOf(Buffer);

      unzip(buffer, (err, zip, data) => {
        expect(err).to.not.exist();

        const file = zip.files['file.js'];

        expect(Object.keys(zip.files).length).to.equal(1);
        expect(file).to.be.an.object();
        expect(file.name).to.equal('file.js');
        expect(file.dir).to.be.false();
        expect(file._asBuffer).to.equal(Fs.readFileSync(input));
        done();
      });
    });
  });
});
