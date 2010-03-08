/* ***** BEGIN LICENSE BLOCK *****
 *   Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 * 
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Bug Id Helper
 *
 * The Initial Developer of the Original Code is
 * Heather Arthur.
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s): 
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 * 
 * ***** END LICENSE BLOCK ***** */
window.addEventListener("load", function(){ bugidHelper.init(); }, false);

var bugidHelper = {

  prefs :  Components.classes['@mozilla.org/preferences-service;1']
           .getService(Components.interfaces.nsIPrefService)
           .getBranch("extensions.bugid."),

  prefService : Components.classes['@mozilla.org/preferences-service;1']
             .getService(Components.interfaces.nsIPrefBranch2),

  /* 1 - bug id */
  contextExp : /^(?:.*bug|ug|g)?\s*#?(\d{2,7})(?:$|\b)/i,

  /* 1 - character before, 2 - text to linkify, 3 - bug id */
  bugExp : /([^a-zA-Z]|^)(bugs?\s*(?:id)?\s*[#\:\-_]?\s*(\d+))/i,

  /* 1 - base url */
  baseUrlExp : /^(?:https?:\/\/)?([\w\:\.\/]*?)\/?(?:show_bug\.cgi\?id=)?$/,

  /* 1 - domain */
  domainExp : /^(?:https?:\/\/)?([\w\.\:\-~\/]*)\//,

  /* 1 - url w/o protocol, 2 - base url, 3 - bug id, 4 - (optional) comment number */
  urlExp : /(?:https?:\/\/)?(([\w\.\:\-\/]*\/?show_bug\.cgi\?)id=(\d+)(?:#c(\d+))?)/,

  dateExp : /\d+\-\d+\-\d+/,

  hostUrl : 'chrome://bugid/content/options.xul', // for login manager

  init : function () {
    this.strings = document.getElementById("bugid-strings");

    /* add content page load listener */
    var content = document.getElementById("appcontent");
    if(content)
      content.addEventListener("load", function(e) { bugidHelper.contentLoad(e); }, true);

    /* thunderbird email load */
    var messagepane = document.getElementById("messagepane");
    if(messagepane)
      messagepane.addEventListener("load", function(e) { bugidHelper.contentLoad(e); }, true);
  },

  contentLoad : function(event) {
    var doc = event.originalTarget;
    if(this.canBugify(doc)) {
      bugidHelper.bugifyContent(doc, doc.body);
      /* listen for node insertion (gmail, etc.) */
      doc.addEventListener("DOMNodeInserted", function(e) {
        if(e.target.className == "__firefox_bugidhelper")
          return; // prevent possible infinite recursion
        bugidHelper.bugifyContent(doc, e.target);
      }, true);
    }
  },

  bugifyContent : function(doc, target) {
    if(this.getBoolPref("linkify"))
      bugidLinks.linkifyContent(doc, target);
    if(this.getBoolPref("tooltipify"))
      bugidTooltip.tooltipifyContent(doc, target);
  }, 

  toBugzillaDomain : function (fragment) {
    var matches = fragment.match(this.baseUrlExp);
    if(matches)
      return "https://" + matches[1] + "/";
  },

  toBaseUrl : function (fragment) {
    var matches = fragment.match(this.baseUrlExp);
    if(matches)
      return "http://" + matches[1] + "/show_bug.cgi?";
  },

  canBugify : function(doc) {
    if(!doc.location || doc.location.href.indexOf("about:") == 0)
      return false;
    if(!this.getBoolPref("linkify") && !this.getBoolPref("tooltipify"))
      return false;
    return true;
  },

  canSetHref : function(doc, elem) {
    return !this.xpathBool(doc,
      "boolean(ancestor-or-self::*[@href])", elem);
  },

  canLink : function(doc, elem) {
    return !this.xpathBool(doc, "boolean(ancestor-or-self::*[@class='__firefox_bugidhelper'])");
  },

  getBoolPref : function(pref) {
    return this.prefs.getBoolPref(pref);
  },

  getLogin : function() {
    if ("@mozilla.org/passwordmanager;1" in Components.classes) {
      // Thunderbird 2
      var passwordManager = Components.classes["@mozilla.org/passwordmanager;1"]
                            .getService(Components.interfaces.nsIPasswordManager);
      var e = passwordManager.enumerator;
      while (e.hasMoreElements()) {
        var loginInfo = e.getNext().QueryInterface(Components.interfaces.nsIPassword);
        if (loginInfo.host == bugidHelper.hostUrl)
          return {username: loginInfo.user, password: loginInfo.password};
      }
    }
    else if ("@mozilla.org/login-manager;1" in Components.classes) {
      // Thunderbird 3, Firefox 3
      var loginManager = Components.classes["@mozilla.org/login-manager;1"]
                          .getService(Components.interfaces.nsILoginManager);

      var logins = loginManager.findLogins({}, bugidHelper.hostUrl, "", null);
      if(logins.length > 0)
        return {username: logins[0].username, password: logins[0].password};
    }
    return {username:'', password:''};
  },

  xhr : function (url, callback) {
    var req = new XMLHttpRequest();
    req.open('GET', url, true);
    req.onreadystatechange = function (event) {
      if (req.readyState == 4) {
        if(req.status == 200)
          callback(true, req.responseXML);
        else
          callback(false);
      } 
    };
    req.send(null);
  },

  bugAttribute : function(target, tag) {
    var elements = target.getElementsByTagName(tag);
    if(elements.length)
      return elements[0].firstChild.data;
    else return '';
  },

  toDate : function(bugDate) {
    var matches = bugDate.match(this.dateExp);
    return matches[0];
  },
  
  xpathNodes : function(doc, expression, element) {
    var target = element || doc;
    var results = [];
    var query = doc.evaluate(expression, target,
        null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    for (var i = 0, len = query.snapshotLength; i < len; i++)
      results.push(query.snapshotItem(i));
    return results;
  },

  xpathBool : function(doc, expression, element) {
    var target = element || doc;
    return doc.evaluate(expression, target, null, XPathResult.BOOLEAN_TYPE, null).booleanValue;
  },
 
  xpathString : function(doc, expression, element) {
    var target = element || doc;
    return doc.evaluate(expression, target, null, XPathResult.STRING_TYPE, null).stringValue;
  }
}

bugidHelper.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2); // for addObserver
