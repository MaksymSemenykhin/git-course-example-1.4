'use strict';
const IN_ARRAY = require('in_array');


const possibleCases = [1, 2, 3, 4];

/**
 * @typedef {Object} Toc
 * @property {string} text
 * @property {string} lang
 * @property {integer} id
 * @property {integer} indentation
 */

/**
 * @typedef {Object} TocObject
 */

class TocObject
{

  constructor(tableOfContents)
  {
    this._disabled = true;
    this._text = null;
    this._id = null;
    this._lang = null;
    this._indentation = null;
    this._attributes = [];

    let _tocValue = null;

    if (IN_ARRAY(typeof tableOfContents, ['object', 'array']))
    {
      Object.keys(tableOfContents).forEach((element) =>
      {
        if (typeof tableOfContents[element] !== 'undefined' && typeof tableOfContents[element]['name'] !== 'undefined')
        {
          this._attributes[tableOfContents[element].name] = tableOfContents[element].value;
        }
        else
        {
          this._attributes[element] = tableOfContents[element];
        }
      });
    }
    else
    {
      this._attributes['default'] = tableOfContents;
    }

    if (this.attrExist('isInToc') && this.getAttr('isInToc') === 'on')
    {
      this._disabled = false;
      if (this.attrExist('tocLevel'))
      {
        _tocValue = this.getAttr('tocLevel');
      }
    }
    else
    {
      if (this.attrExist('default'))
      {
        _tocValue = this.getAttr('default');
        this._disabled = false;
      }else{
        this._disabled = true;

      }
    }

    this.setIndentation(_tocValue);

  }

  getAttr(attribute)
  {
    if (this.attrExist(attribute))
    {
      return this._attributes[attribute];
    }

    return null;
  }

  attrExist(attribute)
  {
    return typeof this._attributes[attribute] !== 'undefined';
  }

  setLand(lang)
  {
    if (typeof lang === "string" && lang.length > 0)
    {
      this._lang = lang;
    }
  }

  setText(text)
  {
    if (typeof text === "string" && text.length > 0)
    {
      this._text = text;
    }
  }

  setId(id)
  {
    if (typeof id === "string" && id.length > 0)
    {
      this._id = id;
    }
  }

  setIndentation(indentation)
  {
    if (!indentation)
    {
      return;
    }

    indentation = indentation.replace(
      new RegExp('\\w+', 'g'),
      (groupMatch, match) =>
      {
        return match;
      }
    );

    indentation = parseInt(indentation);
    if (possibleCases.includes(indentation))
    {
      this._indentation = indentation;
    }
  }

  /**
   * @return {Toc}
   */
  getJson()
  {

    let tocObject = {};

    if (this._text !== null)
    {
      tocObject.text = this._text;
    }
    tocObject.styles = [];

    if (this._id !== null)
    {
      tocObject.id = this._id;
    }

    if (this._indentation !== null)
    {
      tocObject.indentation = this._indentation;
    }

    if (this._lang !== null)
    {
      tocObject.lang = this._lang;
    }

    return tocObject;

  }

  /**
   * @return {Boolean}
   */
  isEmpty()
  {
    return this._disabled === true || !this._text;
  }

}


module.exports = {
  TocObject
};
