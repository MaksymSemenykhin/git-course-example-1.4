'use strict';
const PATH = require('path');
const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-hoodie-api'));
global.local_modules_dir = PATH.join(__dirname, '../../../../../local_modules');
global.local_modules_npm_dir = PATH.join(global.local_modules_dir, '/node_modules');


const fs = require('fs');
const fse = require('fs-extra');
const md5File = require('md5-file');
const sharp = require('sharp');
const _ = require('underscore');
const MOMENT = require('moment');
const CRYPTO = require('crypto');
const CHEERIO = require('cheerio');
const IN_ARRAY = require('in_array');
const YAML = require('yamljs');
const searchManager = require('./search/searchDocumentManager');
const Dirstructure = require('./dirstructure.js');
var dataConfigPath = PATH.join(__dirname, '../../config/data.json');
var dataConfig = {};
if (fs.existsSync(dataConfigPath)) {
  dataConfig = YAML.load(dataConfigPath);
}
let badAlignment = {};
const modelsPath = '../../models/';
const illustrations = require(modelsPath + 'illustrations.js');
let libraryFilesModel = new illustrations.Illustrations();

let blocksModel = require(modelsPath + 'blocks');
const ilmBlocksModel = new blocksModel();
let helper = require(PATH.join(__dirname, 'helper'));
const publicationModel = require(PATH.join(__dirname, 'publicationModel'));
const defined = require('isdefined');
const {hashElement} = require('folder-hash');
const logger = console;
const ProgressBar = require('cli-progress');
let VERSION;
const START = 0;
let LIMIT = 0;
let BOOK_ID;
let bookDirDebug;
let skipAudio = false
let skipIllustrations = false
const blockValidation = require('./blockValidation.js');

const DEFAULT_VERSION = '1.0';
let errorMessage = [];

var TIMING = {
  scope: {},
  start: function (name) {
    if (typeof this.scope[name] == 'undefined') {
      this.scope[name] = {
        start: 0,
        total: 0
      };
    }
    this.scope[name].start = new Date().getTime();

  },
  stop: function (name) {
    if (typeof this.scope[name] == 'undefined')
      logger.error(name);
    this.scope[name].total += new Date().getTime() - this.scope[name].start;
  },
  debug: function () {
    logger.info('\n\ndebug:');
    Object.keys(this.scope).forEach(function (key) {
      let item = TIMING.scope[key];
      let time = Math.round(item.total / 1000);
      let timeFuzzy = '';
      var minute = 60,
        hour = minute * 60;
      if (time > hour) {
        timeFuzzy = Math.floor(time / hour) + 'h ' + (time - Math.floor(time / hour) * hour) + 'm'
      } else {
        if (time > minute) {
          timeFuzzy = Math.floor(time / minute) + 'm ' + (time - Math.floor(time / minute) * minute) + 's'
        } else {
          timeFuzzy = time + 's';
        }
      }
      logger.info(key + ':' + timeFuzzy + '(' + time + ')');
    });

    Object.keys(helper.getSkippedBlocksData()).forEach(function (typeKey) {
      const type = helper.getSkippedBlocksData()[typeKey];
      let tagsToshow = [];
      Object.keys(type).forEach(function (typeTag) {
        if (typeTag !== 'count' && typeTag !== 'blocks') {
          const tag = type[typeTag];
          tag.type = typeTag;
          if (tag.count || tag.classes.length) {
            tagsToshow.push(tag);
          }
        }
      });

      if (tagsToshow.length || type.count) {
        console.log('typeKey:' + typeKey + ' count:' + type.count);
        console.log(tagsToshow);
      }
    });
  }
};

const ALIGNMENT = require('../../helpers/alignment.js');
const alignmentParse = require(PATH.join(__dirname, '/alignmentParse.js'));

const SERVER_DIR = process.env.SERVER_PATH;
const AUDIO_DIR = dataConfig.audio_path ? dataConfig.audio_path.replace(/\/$/, '') : PATH.join(SERVER_DIR, '/server/audio_data');
const SOURCE_DIR = PATH.join(SERVER_DIR, '/server/books_publish');
const publishedBooksDir = PATH.join(SOURCE_DIR, 'books');

let archiveAssetsDir, _imageContent, bookDir, bookIdHash;
const tocs = [];
let without_alignment = 0;
let _archiveJson = [];
let fileIndexContent = [];
let _content = '';

const DEF_COVER = sharp(PATH.join(__dirname, 'cover.png'));
const COVERS = JSON.parse(fs.readFileSync(PATH.join(__dirname, 'covers.json'), 'utf8'));
const libraryManifest = JSON.parse(fs.readFileSync(PATH.join(__dirname, 'libraryManifest.json'), 'utf8'));


let _getAudioPathFromUrl = function (url) {
  return url.replace('/audiofiles', AUDIO_DIR);
};

let _updateMeta = function (id, metaUpdate) {
  return new Promise(function (resolve) {
    return resolve("");
  });
};


let coversCopy = function () {

  logger.info('book publishing | copying covers');
  let PromiseArr = COVERS.reduce(function (previousValue, currentValue) {

    let imageData = Buffer.from(_imageContent.data, 'base64');

    previousValue.push(new Promise(function (resolve) {

      let currentValuePath = PATH.join(bookDir, currentValue.name);
      sharp(imageData)
        .resize({
          width: currentValue.size[0],
          height: currentValue.size[1],
          background: {r: 0, g: 0, b: 0, alpha: 0.0},
          fit: 'contain',
        })
        .toFile(currentValuePath)
        .then(() => {
          publicationModel.addCoverAsset(currentValue.name);
          // publicationModel.getAssets().cover.push(currentValue.name);
          let extension = currentValue.name.split('.').pop();
          let targetFilename = md5File.sync(currentValuePath) + '.' + extension;
          let targetFilenamePath = PATH.join(bookDir, targetFilename);
          try {

            if (fse.pathExistsSync(targetFilenamePath)) {
              fse.removeSync(currentValuePath);
            } else {
              fse.moveSync(currentValuePath, targetFilenamePath);
            }

          } catch (err) {
            _error(err.toString())
          }
          // filePublicationContent.map[currentValue.name] = targetFilename;
          publicationModel.addToMap(targetFilename, currentValue.name);
          extension = 'webp';
          targetFilename = targetFilename.split('.').shift();
          let targetFilenameFull = targetFilename + '.' + extension
          let targetFilenameFullPath = PATH.join(bookDir, targetFilenameFull);


          sharp(imageData).resize({
            width: currentValue.size[0],
            height: currentValue.size[1],
            background: {r: 0, g: 0, b: 0, alpha: 0.0},
            fit: 'contain',
          })
            .toFile(targetFilenameFullPath, (err) => {
              if (err) {
                // logger.error('Failde to save ' + targetFilenameFullPath + ' as webp');
                _error(err.toString())
              }


              try {

                if (fse.pathExistsSync(targetFilenameFullPath)) {
                  fse.removeSync(currentValuePath);
                } else {
                  fse.moveSync(currentValuePath, targetFilenameFullPath);
                }

              } catch (err) {
                _error(err.toString())
              }

              publicationModel.addToMap(targetFilenameFull, currentValue.name.split('.').shift() + '.' + extension);
              publicationModel.addCoverAsset(currentValue.name.split('.').shift() + '.' + extension);
              // filePublicationContent.map[currentValue.name.split('.').shift() + '.' + extension] = targetFilenameFull
              // filePublicationContent.assets.cover.push(currentValue.name.split('.').shift() + '.' + extension );
              resolve();

            });

        })
        .catch(err => {
          _error(err.toString())

        })
    }));

    return previousValue;
  }, []);


  return PromiseArr;


};


let _is = function (element, selector) {
  _is = 'matches' in element ?
    function (element, selector) {
      return element.matches(selector);
    } :
    function (element, selector) {
      return element.msMatchesSelector(selector);
    };
  return _is(element, selector);
};

let _imageCopy = function (item) {
  return sharp(item.from)
    .toFile(item.to)
    .catch(err => {

      let errorText = [];
      errorText.push('Cannot save block illustration');
      errorText.push('Capter #' + item.chapterN);
      errorText.push('block id : ' + item.blockId);

      errorText.push(err.toString());
      errorText = errorText.join('. ');
      _error(errorText);
    })
    .then(() => {
      let imageCopyHash = md5File.sync(item.to);
      publicationModel.addFile(item.to, item.ext, imageCopyHash);
      publicationModel.addToMap(imageCopyHash + '.' + item.ext, blockIndexToIlId(item.chapterN, item.imN) + '.' + item.ext);
      publicationModel.addImageAsset(blockIndexToIlId(item.chapterN, item.imN) + '.' + item.ext);
    }).catch(err => {

      let errorText = [];

      errorText.push('Cannot copy block illustration');
      errorText.push('Capter #' + item.chapterN);
      errorText.push('block id : ' + item.blockId);
      errorText.push(err.toString());
      errorText = errorText.join('. ');
      _error(errorText);

    });
};


let blockN = 1;
let imN = 1;
let chapterN = 1;
let appendQueue = {};

let _blocksPrepare = function(_blocks, meta) {
  TIMING.start('_blocksPrepare 0');

  return Promise.all([DEF_COVER.metadata(), DEF_COVER.toBuffer()])
    .then((defCoverData) => {
      let blocksToParse = [];
      let imagesToCopy = [];
      let imagesToCopyPromises = [];

      TIMING.stop('_blocksPrepare 0');
      TIMING.start('_blocksPrepare 1');
      helper.setDefCoverData(defCoverData);

      let blocksToParseLength = 1;
      TIMING.stop('_blocksPrepare 1');

      //debug main loop
      for (var i = START, len = LIMIT > _blocks.length ? _blocks.length : LIMIT; i < len; i++) {
        let doc = _blocks[i];

        // if word has data flag
        if(doc.content.search(/<f\s*/)){
          // remove data flag
          doc.content = doc.content.replace(/<f\s*(?:.*?)>(.*?)<\/f>/mig,
            (groupMatch, match) => {
              return match;
            }
          );
        }


        blockValidation.init(doc.content)

        if(!blockValidation.footnoteInSg(doc.content)){
          _addErrorSentense("block " + doc.blockid + " contains footnote in suggestion block");
          _addErrorSentense("at the moment this is not supported");
          return _error();
        }

        if(!blockValidation.htmlCheck(doc.content)){
          logger.warn("html of block " + doc.blockid + " is not valid. unclosed tags, wrong tags order, etc");
        }

        if (skipAudio) {
          delete doc.audiosrc;
          delete doc.audiosrc_ver;
        }

        if (doc.illustration && skipIllustrations) {
          doc.illustration = PATH.join(SERVER_DIR, 'server/ilm/ver_1/actions/publishBook/defCover.jpg');
        }


        if (defined.is_defined(doc.audiosrc_ver) && defined.is_defined(doc.audiosrc_ver.m4a)) {
          doc.audiosrc_ver.m4a = _getAudioPathFromUrl(doc.audiosrc_ver.m4a);
        }

        let id = blockIndexToblockId(blocksToParseLength);
        let blockData;
        try {
          blockData = helper.blockTypeDefine(doc);
        }catch (e) {
           return _error(e.toString());
        }
        const block = blockData.block;

        publicationModel.blockDataProcess(blockData);

        if (blockData.data && blockData.data.filePublicationContent) {
          blockData.data.imagesToCopy.forEach((file, id) => {
            imagesToCopy.push(file);
          });
        }

        publicationModel.docProcess(doc, id);

        if (!block) {
          continue;
        }

        if ( doc.audiosrc_ver && typeof doc.audiosrc_ver.m4a != 'undefined' && fse.pathExistsSync(doc.audiosrc_ver.m4a)) { // jshint ignore:line
          block.attr('data-audio', '1');
        }

        blocksToParse.push([
          block
        ]);
        blocksToParseLength++;

        _archiveJson.push(doc);
      }


      imagesToCopy.forEach(function (item) {
        imagesToCopyPromises.push(_imageCopy(item));
      });

      helper.setAppends(appendQueue);
      TIMING.start('_blocksPrepare 2 html');

      Object.keys(blocksToParse).map(function (index) {
        let _block = blocksToParse[index];
        let result = helper.html(_block[0],null,null,{"skipAudio":skipAudio});
        _content += result.wrapResult.html;
        blockN++;
        chapterN = result.chapterN;
        if (result.toc) {
          tocs.push(result.toc);
        }

        result.fileIndexBlock.index = fileIndexContent.length;

        if (fileIndexContent.length) {
          fileIndexBlockStartTotal += fileIndexContent[fileIndexContent.length - 1].offset;
          result.fileIndexBlock.start = fileIndexBlockStartTotal;
        }

        fileIndexContent.push(result.fileIndexBlock);

      });

      if (!tocs.length && !blocksToParse.length) {
        return _error('Error: book without blocks and toc will not be opened in reader')
      }

      if (!tocs.length) {
        tocs.push(
          {
            "text": BOOK_ID,
            "id": blocksToParse[0][0].attr('id')
          }
        );
      }

      TIMING.stop('_blocksPrepare 2 html');

      TIMING.start('_blocksPrepare 3');
      logger.info('\nbook publishing | saving content.htm');
      let filename = PATH.join(bookDir, 'content.html');
      fs.writeFileSync(filename, _content);
      logger.info('book publishing | blocks done');
      TIMING.stop('_blocksPrepare 3');

      return Promise.all(imagesToCopyPromises);
    }).catch((e) => {
      _error(e.toString())
    });

};
let blockIndexToblockId = function (i) {
  return 'para_' + i;
}
let blockIndexToIlId = function (blockId, imgId) {
  return 'ch' + (blockId) + 'p' + imgId;
}

let fileIndexBlockStartTotal = 0;


let _fileCopy = function () {
  logger.info('book publishing | coping assets files');
  publicationModel.getFiles().forEach(f => {

    let destinations = [bookDir, archiveAssetsDir];
    destinations.map(function (currentValue) {
      let _filePath = PATH.join(currentValue, f.id + '.' + f.ext);
      if (!fse.pathExistsSync(_filePath)) {
        try {
          fse.copySync(f.path, _filePath);
        } catch (e) {
          _error(e.toString())
        }
      }
    });

  });
  logger.info('book publishing | assets files copied');
};


let createManifestFromPublJson = function () {
  publicationModel.getKeys().forEach(function (assetsName) {
    const realName = publicationModel.getMap()[assetsName];
    const assetsPath = PATH.join(bookDir, 'publication.json');
    const stat = fs.statSync(assetsPath);
    libraryManifest.size += stat.size;
    libraryManifest.files.push(realName);
  });
};


let saveBuffData = function (filePath, buffData, callback) {
  fs.open(filePath, 'w+', function (err, fd) {
    if (err) {
      callback(err, null);
    }
    fs.write(fd, buffData, 0, buffData.length, function (err) {
      if (err) {
        throw err;
      }
      fs.close(fd, function (err) {
        if (err) {
          callback(err, null);
        }
        callback(null, filePath);
      });
    });
  });
};


let saveBuffDataDeff = function (filePath, buffData) {
  return new Promise(function (resolve, reject) {
    saveBuffData(filePath, buffData, function (err, data) {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};

let _addErrorSentense = function (message) {
  errorMessage.push( /[a-z]/.test(message.trim()[0]) ? message.trim()[0]
    .toUpperCase() + message.slice(1) : message);
}

let _error = function (message) {
  if(typeof message === 'undefined' && errorMessage.length ){
    errorMessage.unshift('error');
    message = errorMessage.join('. ');
  }

  logger.error(message);
  return _updateMeta(BOOK_ID, {
    publicationStatus: message,
    isInTheQueueOfPublication: false,
    isIntheProcessOfPublication: false
  }).then(() => {
    process.exit(1);
  })
};


/**
 * Main runner. This function should be called by router
 * Convert specific book, related data into reader format book.
 * @param {string} bookId
 * @param {Object} superlogin
 */
let _collect_data  = function (bookId, superlogin) {

  _updateMeta = function (id, metaUpdate) {
    return ilmBlocksModel.updateMeta(id, metaUpdate)
      .then(update => {
        logger.info('book publishing | meta for book updated');
        return update;
      })
      .catch(err => {
        return Promise.reject(err);
      });
  };

  BOOK_ID = bookId;

  TIMING.start('total');
  TIMING.start('_collect_data 1');

  logger.info('book publishing | ==> bookId:' + BOOK_ID);
  logger.info('book publishing | gettings meta and covers');

  let meta = ilmBlocksModel.getMeta(BOOK_ID);
  let coverimg = libraryFilesModel.getCoverimgPublish(BOOK_ID);
  let coverimgDef = sharp(PATH.join(__dirname, 'defCover.jpg')).toBuffer();

  return Promise.all([
    meta,
    coverimg,
    coverimgDef,
    _updateMeta(BOOK_ID, {
      publicationStatus: 'inProgress',
      isInTheQueueOfPublication: false,
      isIntheProcessOfPublication: true
    }),
    hashElement(__dirname)
  ])
    .then(response => {
      TIMING.stop('_collect_data 1');

      VERSION = response[4].hash;

      logger.info('book publishing | got meta and covers');
      if (!response[0].author)
        response[0].author = [];


      bookIdHash = generateId(response[0]);
      logger.info('book publishing | hash:'+bookIdHash);

      bookDir = PATH.join(publishedBooksDir, generateId(response[0]));
      bookDirDebug = PATH.join(bookDir, 'data');

      fse.ensureDirSync(bookDir);
      fse.emptyDirSync(bookDir);

      fse.ensureDirSync(bookDirDebug);
      fse.emptyDirSync(bookDirDebug);

      fse.writeJsonSync(PATH.join(bookDirDebug, 'coverimg.json'), response[1]);
      fse.writeJsonSync(PATH.join(bookDirDebug, 'coverimgDef.json'), response[2]);

      let prepare = [];
      prepare.push(ilmBlocksModel.getBookBlocksFull(BOOK_ID));
      prepare.push(ilmBlocksModel.getBookBlocksByIdx(BOOK_ID));

      return Promise.all(prepare).then((prepareResults) => {

        let meta = response[0];
        fse.writeJsonSync(PATH.join(bookDirDebug, 'meta.json'), meta);
        fse.writeJsonSync(PATH.join(bookDirDebug, 'filters_byBook.json'), prepareResults[0]);
        fse.writeJsonSync(PATH.join(bookDirDebug, 'getBookBlocksByIdx.json'), prepareResults[1]);
        fse.writeJsonSync(PATH.join(bookDirDebug, 'bookId.json'), BOOK_ID);

        return convertBook({path: bookDirDebug});
      })
      .catch(err => {
        _error(err.toString())
      });
    })
    .catch(err => {
      _error(err.toString())
    });
};


let convertBook = function (option) {
  bookDirDebug = option.path
    ? option.path : (option.folder
      ? PATH.join(process.env.SERVER_PATH, 'server/books_publish/books-tmp', option.folder, 'data') : null);

  skipAudio = option.skipAudio;
  skipIllustrations = option.skipIllustrations;
  LIMIT = option.blockLimit ? option.blockLimit : 9999999;

  TIMING.start('_collect_data 3');
  TIMING.start('_collect_data 4');

  _content = '';
  blockN = 1;
  imN = 1;
  chapterN = 1;
  without_alignment = 0;
  _archiveJson = [];
  fileIndexContent = [];

  BOOK_ID = JSON.parse(fs.readFileSync(PATH.join(bookDirDebug, 'bookId.json'), 'utf8'));

  let meta = JSON.parse(fs.readFileSync(PATH.join(bookDirDebug, 'meta.json'), 'utf8'));
  let coverimg = JSON.parse(fs.readFileSync(PATH.join(bookDirDebug, 'coverimg.json'), 'utf8'));
  let coverimgDef = JSON.parse(fs.readFileSync(PATH.join(bookDirDebug, 'coverimgDef.json'), 'utf8'));
  let filters_byBook = JSON.parse(fs.readFileSync(PATH.join(bookDirDebug, 'filters_byBook.json'), 'utf8'));
  let getBookBlocksByIdx = JSON.parse(fs.readFileSync(PATH.join(bookDirDebug, 'getBookBlocksByIdx.json'), 'utf8'));

  bookIdHash = generateId(meta);
  bookDir = PATH.join(publishedBooksDir, bookIdHash);
  fse.ensureDirSync(bookDir);

  helper.init({
    'AUDIO_DIR': AUDIO_DIR,
    'IMAGES_DIR': PATH.join(SERVER_DIR, '/server/books_images'),
    'bookDir': bookDir
  });

  helper.setBookGlobalStyle(meta);

  publicationModel.start();

  let blocksCRows = filters_byBook;
  let blocksC = {};
  let _blocks = {};

  _blocks.rows = getBookBlocksByIdx && getBookBlocksByIdx.blocks ? getBookBlocksByIdx.blocks : [];

  if (blocksCRows && blocksCRows.length) {
    blocksCRows.forEach(r => {
      blocksC[r.blockid] = r;
    });
  }

  _blocks.rows.forEach(b => {
    let blockC = blocksC[b.blockid];
    b.content = '';
    b.classes = {};
    if (blockC) {
      b.data = blockC;
      b.parnum = b.parnum ? b.parnum : blockC.parnum;
    }
  });

  let version = meta.version ? meta.version : DEFAULT_VERSION;
  let dirArchive = bookDir;
  _imageContent = coverimg ? coverimg : {data: coverimgDef};

  if (!defined.is_defined(meta.text)) {
    console.warn('meta.text is not defined');
    meta.text = '';
  }

  _blocks.rows = _blocks.rows.map((currentValue) => {
    let item = currentValue.data;
    item.parnum = {};
    item.parnum.parnum = currentValue.parnum;
    item.parnum.secnum = currentValue.secnum;
    item.parnum.isHidden = currentValue.isHidden;
    item.parnum.isManual = currentValue.isManual;
    item.parnum.isNumber = currentValue.isNumber;
    return item;
  });

  fse.writeJsonSync(PATH.join(bookDirDebug, 'content_reduce.json'), _blocks.rows);

  meta.text = _.compact(_blocks.rows.map(function (currentValue) {
    if (defined.is_defined(currentValue.content) && currentValue.content) {
      const cHtml = CHEERIO.load(currentValue.content);
      return cHtml.text();
    } else {
      return '';
    }
  })).map(item => item.replace(/\.+$/g, '')).join('. ');

  meta.sentencesCount = meta.text.split(/\.\s+/g).length;

  let preparePromises = [];

  if (_imageContent) {
    preparePromises = preparePromises.concat(coversCopy());
  }

  archiveAssetsDir = dirArchive;

  fse.ensureDirSync(dirArchive);
  fse.ensureDirSync(archiveAssetsDir);

  let _blocksPreparePromise = _blocksPrepare(_blocks.rows, meta);
  preparePromises.push(_blocksPreparePromise);
  logger.info('book publishing | waiting blocks and covers copying jobs');

  return _blocksPreparePromise
    .then(() => {
    TIMING.stop('_collect_data 3');
    logger.info('book publishing | blocks prepared');

    _fileCopy();

    logger.info('book publishing | waiting covers job done');
    return Promise.all(preparePromises)
      .then(_result => {
        TIMING.stop('_collect_data 4');

        TIMING.start('_collect_data 5');
        TIMING.start('_collect_data 6');

        logger.info('book publishing | saving publication, index, alignment, offsetMap and alignment files ');

        let _preparePromises = [];

        _preparePromises.push(new Promise(function (resolve, reject) {
          fse.writeJson(PATH.join(bookDirDebug, 'blocks.json'), _archiveJson, function (err) {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        }));

        let fileIndexContent_ = {};
        fileIndexContent.forEach(function (element) {
          fileIndexContent_[element.id] = element;
        });

        let lastAlignmentLocator = false;
        let alignmentLocatorIndex = 0; //word number in paragraph
        let lastPar = 0;
        let aligner = helper.aligner();
        aligner.getLocatiors().forEach(function (alignmentLocator) {
          if (lastPar !== alignmentLocator[0]) {
            alignmentLocatorIndex = 0;
            lastPar = alignmentLocator[0];
          }
          alignmentLocator = alignmentLocator.split('.');
          if (lastAlignmentLocator && lastAlignmentLocator[0] === alignmentLocator[0]) {
            if (lastAlignmentLocator[2] !== alignmentLocator['1']) {
              if (!badAlignment['para_' + lastAlignmentLocator[0]]) {
                badAlignment['para_' + lastAlignmentLocator[0]] = [];
              }
              badAlignment['para_' + lastAlignmentLocator[0]].push([lastAlignmentLocator, alignmentLocator]);
            }
          }
          lastAlignmentLocator = alignmentLocator;
          alignmentLocatorIndex++;
        });

        let alignerData = [aligner.getTimings(), aligner.getLocatiors()];

        fse.writeJsonSync(PATH.join(bookDir, 'index.json'), fileIndexContent_);
        fse.writeJsonSync(PATH.join(bookDirDebug, 'alignment.json'), alignerData);

        let alignmentBuffer = ALIGNMENT.createBinatyStructure(alignerData);
        let alignment = alignmentParse.parseRawIndex(alignmentBuffer);
        let offsetMap = alignmentParse.createOffsets(alignment);

        fse.writeJsonSync(PATH.join(bookDir, 'offsetMap.json'), offsetMap);
        fse.writeJsonSync(PATH.join(bookDirDebug, 'offsetMap.json'), offsetMap);
        fse.writeJsonSync(PATH.join(bookDirDebug, 'fileIndexContent.json'), fileIndexContent);
        fse.writeJsonSync(PATH.join(bookDirDebug, 'fileIndexContent_.json'), fileIndexContent_);

        let words = helper.getWords();
        let _words = {};
        let start = 0;

        Object.keys(words).map(function (id) {

          if (typeof _words[id] === 'undefined') {
            _words[id] = {};
            start = 0;
          }

          for (var _wordsIndex = 0; _wordsIndex < words[id].length; _wordsIndex++) {
            let i = start;
            if (typeof _words[id][i] === 'undefined') {
              _words[id][i] = {};
            }
            _words[id][i]['words'] = words[id][_wordsIndex];
            _words[id][i]['length'] = words[id][_wordsIndex].length;
            _words[id][i]['start'] = start;
            start += words[id][_wordsIndex].length;
          }
        });

        fse.writeJsonSync(PATH.join(bookDirDebug, 'words.json'), _words);
        fse.writeJsonSync(PATH.join(bookDirDebug, 'badAlignment.json'), badAlignment);
        fse.writeJsonSync(PATH.join(bookDir, 'publisher.json'), {
          version: VERSION
        });

        _preparePromises.push(saveBuffDataDeff(PATH.join(bookDir, 'alignment.dat'), alignmentBuffer));

        fs.writeFileSync(PATH.join(bookDir, 'content.html'), _content);

        publicationModel.addToMap(md5File.sync(PATH.join(bookDir, 'index.json')) + '.json', 'index.json');
        publicationModel.addToMap(md5File.sync(PATH.join(bookDir, 'content.html')) + '.html', 'content.html');
        publicationModel.addToMap(md5File.sync(PATH.join(bookDir, 'offsetMap.json')) + '.json', 'offsetMap.json');

        fse.writeJsonSync(PATH.join(bookDir, 'publication.json'), publicationModel.complete(meta.version ? meta.version : DEFAULT_VERSION));

        return Promise.all(_preparePromises)
          .then(() => {
            logger.info('book publishing | moving assets files from PublicationContent.map ');
            TIMING.stop('_collect_data 6');
            TIMING.start('_collect_data 7');
            publicationModel.addToMap(md5File.sync(PATH.join(bookDir, 'alignment.dat')) + '.dat', 'alignment.dat');

            publicationModel.getKeys().map(_fileFrom => {
              let _fileTo = publicationModel.getMap()[_fileFrom];
              try {
                if (_fileTo !== 'meta.json') {
                  if (!fs.existsSync(PATH.join(bookDir, _fileTo))) {
                    fs.renameSync(PATH.join(bookDir, _fileFrom), PATH.join(bookDir, _fileTo));
                  }
                  if (_fileTo !== _fileFrom) {
                    if (fs.existsSync(PATH.join(bookDir, _fileFrom))) {
                      fs.unlinkSync(PATH.join(bookDir, _fileFrom));
                    }
                  }
                }
              } catch (e) {
                _error(e.toString());
              }
            });

            return new Promise(function (resolve, reject) {
              logger.info('book publishing | creating zip book file ');
              TIMING.stop('_collect_data 7');

              dirstructureCreate(bookDir);
              createManifestFromPublJson();
              fse.writeJsonSync(PATH.join(bookDir, 'libraryManifest.json'), libraryManifest);

              return _updateMeta(BOOK_ID, { publicationStatus: 'Creating search index' })
                .then(() => {
                  logger.info('book publishing | creating search index');

                  let searchPromises = [
                    searchManager.createSearchDocFromPublicationByBookId(publishedBooksDir, bookIdHash)
                  ];

                  return Promise.all(searchPromises)
                    .then(() => {

                      let searchIndexType = searchManager.searchFormatsEnum.ELASTIC_PER_PUBLICATION;
                      let summaryFilePath = searchManager._getSearchSummaryFilePath(publishedBooksDir);

                      if (!fs.existsSync(summaryFilePath)) {
                        searchManager.crearteSearchSummary(publishedBooksDir, searchIndexType);
                      } else if (meta.language) {

                        function onlyUnique(value, index, self) {
                          return self.indexOf(value) === index;
                        }

                        let searchSummary = JSON.parse(fs.readFileSync(summaryFilePath, 'utf8'));
                        if (!defined.is_defined(searchSummary.languages)) {
                          searchSummary.languages = [];
                        }
                        if (searchSummary.languages.indexOf(meta.language) === -1) {
                          searchSummary.languages.push(meta.language);
                        }
                        searchSummary.languages = searchSummary.languages.filter(onlyUnique);
                        if (!defined.is_defined(searchSummary['content-' + meta.language])) {
                          searchSummary['content-' + meta.language] = generateId(meta);
                        }
                        fse.writeJsonSync(summaryFilePath, searchSummary);
                      } else {
                        _error('Book has wrong languages');
                      }

                      if (!meta.hasOwnProperty('publishLog') || !meta.publishLog) {
                        meta.publishLog = {
                          publishTime :  Date(),
                          updateTime : false
                        };
                      } else {
                          let publishLogAction = meta.publishLog;
                          publishLogAction.publishTime = Date();
                      }

                      return _updateMeta(BOOK_ID, {
                        published: true,
                        publishedVersion: version,
                        version: version,
                        status: 'published',
                        isIntheProcessOfPublication: false,
                        pubType: 'Published',
                        publicationStatus: 'done',
                        publishLog: meta.publishLog
                      })
                    })
                    .then(() => {
                      logger.info('book publishing | done');
                      return resolve(true);
                    })
                    .catch(err => {
                      _error(err);
                    })
                })
            })
          })
          .catch(err => {
            _error(err.toString())
          });
      })
      .catch(err => {
        _error(err.toString());
      });
    })
    .catch(err => {
      _error(err.toString())
    });
};

const libraryCreateItem = function (bookDir) {

  const _publishedBooksDir = PATH.join(SOURCE_DIR, 'books');
  let libraryContent;
  const _metaFilePath = PATH.join(bookDirDebug, 'meta.json');
  const _publicationFilePath = PATH.join(bookDir, 'publication.json');
  const _metaFileContent = JSON.parse(fs.readFileSync(_metaFilePath, 'utf8'));
  const _publicationFileContent = JSON.parse(fs.readFileSync(_publicationFilePath, 'utf8'));

  const _contentFilePath = PATH.join(bookDirDebug, 'content_reduce.json');
  const _contentFileContent = JSON.parse(fs.readFileSync(_contentFilePath, 'utf8'));

  const item = {};

  if (fs.existsSync(PATH.join(_publishedBooksDir, 'library.json'))) {
    libraryContent = JSON.parse(fs.readFileSync(PATH.join(_publishedBooksDir, 'library.json'), 'utf8'));
  } else {
    libraryContent = {};
  }

  if (typeof libraryContent[_metaFileContent.language] == 'undefined') {
    libraryContent[_metaFileContent.language] = [];
  }

  item.weight = typeof _metaFileContent.weight !== 'undefined' ? Math.round(_metaFileContent.weight * 100) / 100 : 0;
  item.author = _metaFileContent.author.join(',');
  item.name = _metaFileContent.title;
  item.language = _metaFileContent.language;
  item.audio = _contentFileContent.some((element) => {
    return element.audiosrc_ver && Object.keys(element.audiosrc_ver).length && element.audiosrc_ver.m4a;
  });
  item.shortDescription = _metaFileContent.description_short;
  item.readingTime = Math.round(_metaFileContent.wordcount / 140) * 60000;
  item.category = _metaFileContent.category;
  item.type = 'Book';
  item.version = _publicationFileContent.version;
  item.date = _publicationFileContent.date;
  item.publish = {
    "version": {
      "value": _metaFileContent.version,
      "hash": _publicationFileContent.version,
    },
    "date": {
      'timestamp': publicationModel.getDate().format("X"),
    }
  };

  item.id = generateId(_metaFileContent);

  let _covers = {};
  Object.keys(_publicationFileContent.map).map(function (asset) {
    if (IN_ARRAY(asset.split('.').pop(), ['png', 'webp', 'jpg']) && -1 !== asset.indexOf("cover")) {
      _covers[asset] = _publicationFileContent.map[asset];
    }
  });

  item.cover = _covers;

  Object.keys(libraryContent).forEach(function (lang) {
    let newItems = libraryContent[lang].filter(function (_item) {
      return defined.is_defined(_item.id) && _item.id !== item.id;
    });
    libraryContent[lang] = newItems;
  }, this);

  libraryContent[_metaFileContent.language].push(item);

  fse.writeJsonSync(PATH.join(_publishedBooksDir, 'library.json'), libraryContent);

};


const dirstructureCreateItem = function (bookDir) {

  const _publishedBooksDir = PATH.join(SOURCE_DIR, 'books');
  const _metaFilePath = PATH.join(bookDirDebug, 'meta.json');
  const _metaFileContent = JSON.parse(fs.readFileSync(_metaFilePath, 'utf8'));

  const _contentFilePath = PATH.join(bookDirDebug, 'content_reduce.json');
  const _contentFileContent = JSON.parse(fs.readFileSync(_contentFilePath, 'utf8'));

  const _publicationFilePath = PATH.join(bookDir, 'publication.json');
  const _publicationFileContent = JSON.parse(fs.readFileSync(_publicationFilePath, 'utf8'));

  let _dirstructureFileContentItem = {};
  const dirstructure = new Dirstructure.Item(bookDir, SOURCE_DIR);

  const _publicationContent = JSON.parse(fs.readFileSync(PATH.join(bookDir, 'publication.json'), 'utf8'));
  _publicationContent.bookSize = _dirstructureFileContentItem.bookSize;
  _publicationContent.mediaSize = _dirstructureFileContentItem.mediaSize;
  fse.writeJsonSync(PATH.join(bookDir, 'publication.json'), _publicationContent);

  dirstructure.setReducedBlocks(_contentFileContent);
  dirstructure.setBookId(BOOK_ID);
  dirstructure.setBookIdHash(bookIdHash);
  dirstructure.setMeta(_metaFileContent);
  dirstructure.setPublicationFileContent(_publicationFileContent);
  dirstructure.setTocs(tocs);
  dirstructure.setDate(publicationModel.getDate());
  dirstructure.setParagraphsNumber(fileIndexContent.length);

  fse.writeJsonSync(PATH.join(bookDir, dirstructure.getMetaFileNameHash()), dirstructure.metaToJson());

  let _HASH = CRYPTO.createHash('md5');
  _HASH.update(defined.is_defined(_metaFileContent.publishedVersion) && isFloat(_metaFileContent.publishedVersion) ? _metaFileContent.publishedVersion : MOMENT().format("YYYY-MM-DD HH:mm"));

  publicationModel.addToMap(dirstructure.getMetaFileNameHash(), 'meta.json');
  publicationModel.addContentAsset('meta.json');

  fse.writeJsonSync(PATH.join(bookDir, 'publication.json'), publicationModel.complete(_metaFileContent.version?_metaFileContent.version:DEFAULT_VERSION));
  fse.writeJsonSync(PATH.join(_publishedBooksDir, 'dirstructure.json'), dirstructure.toJson());
};


function isFloat(n) {
  return Number(n) === n && n % 1 !== 0;
}


const dirstructureCreate = function (bookDir) {
  try {
    logger.info('book publishing | updating dirstructure file');
    logger.info('book publishing | updating dirstructure file for ' + bookDir + ' book');
    dirstructureCreateItem(bookDir);
    logger.info('book publishing | updating dirstructure file for ' + bookDir + ' book | done');
    logger.info('book publishing | updating library file for ' + bookDir + ' book');
    libraryCreateItem(bookDir);
    logger.info('book publishing | updating library file for ' + bookDir + ' book | done');
  } catch (err) {
    _error(err.toString())
  }
};


const generateId = function (metadata) {
  if (metadata.extid) {
    return metadata.extid;
  } else {
    let _HASH = CRYPTO.createHash('md5');
    _HASH.update(metadata.bookid);
    return _HASH.digest('hex');
  }
};


module.exports = {
  run: _collect_data ,
  someFunc: convertBook
};
