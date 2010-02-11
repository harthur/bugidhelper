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
window.addEventListener("load", function(){ bugIdHelper.init(); }, false);

var bugIdHelper = {

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

    this.prefService = Components.classes['@mozilla.org/preferences-service;1']
                       .getService(Components.interfaces.nsIPrefBranch2);

    this.userUrl = this.prefService.getCharPref("extensions.bugid.url");
    this.baseUrl = this.toBaseUrl(this.userUrl);
    this.prefService.addObserver("extensions.bugid.url", this, false);

    var urls = this.prefService.getCharPref("extensions.bugid.whitelist");
    this.domainExps = this.toDomains(urls);
    this.prefService.addObserver("extensions.bugid.whitelist", this, false);

    var resos = this.prefService.getCharPref("extensions.bugid.link.strike.resos");
    this.strikeResos = resos.split(/[\.,\s]+/);
    this.prefService.addObserver("extensions.bugid.link.strike.resos", this, false);

    /* add context menu popup listener */
    var contextmenu = document.getElementById("contentAreaContextMenu");
    if(contextmenu)
      contextmenu.addEventListener("popupshowing", function(){ bugIdHelper.contextShowing(); }, false);

    /* add content page load listener */
    var content = document.getElementById("appcontent");
    if(content)
      content.addEventListener("load", function(e) { bugIdHelper.contentLoad(e); }, true);

    /* thunderbird email load */
    var messagepane = document.getElementById("messagepane");
    if(messagepane)
      messagepane.addEventListener("load", function(e) { bugIdHelper.contentLoad(e); }, true);
  },

  observe : function(subject, topic, data) {
    if (topic == "nsPref:changed") {
      switch(data) {
        case "extensions.bugid.url":
          this.userUrl = this.prefService.getCharPref("extensions.bugid.url")
          this.baseUrl = this.toBaseUrl(this.userUrl);
          break;
        case "extensions.bugid.whitelist":
          var urls = this.prefService.getCharPref("extensions.bugid.whitelist");
          this.domainExps = this.toDomains(urls);
          break;
        case "extensions.bugid.link.strike.resos":
          var resos = this.prefService.getCharPref("extensions.bugid.link.strike.resos");
          this.strikeResos = resos.split(/[\.,\s]+/);
          break;
        default:
          break;
      }
    }
  },

  /*--- context menu ---*/
  openSelection : function () {
    var bugurl = this.baseUrl + "id=" + this.selectedBug;
    var loadInBackground = this.prefService.getBoolPref("browser.tabs.loadDivertedInBackground");
    gBrowser.loadOneTab(bugurl, null, null, null, loadInBackground, false);
  },

  contextShowing : function() {
    var bugItem = document.getElementById("context-bugid");
    var selection = getBrowserSelection();
    var matches = selection.match(this.contextExp);

    if(matches) {
      this.selectedBug = matches[1];
      bugItem.hidden = false;
      bugItem.label = this.strings.getFormattedString("contextItem", [this.selectedBug]);
    }
    else
      bugItem.hidden = true;
  },

  /*--- linkification ---*/
  contentLoad : function(event) {
    var doc = event.originalTarget;
    if(this.canBugify(doc)) {
      bugIdHelper.bugifyContent(doc, doc.body);
      /* listen for node insertion (gmail, etc.) */
      doc.addEventListener("DOMNodeInserted", function(e) {
        if(e.target.className == "__firefox_bugidhelper")
          return; // prevent possible infinite recursion
        bugIdHelper.bugifyContent(doc, e.target);
      }, true);
    }
  },

  bugifyContent : function(doc, target) {
    if(this.getBoolPref("linkify"))
      this.linkifyContent(doc, target);
    if(this.getBoolPref("tooltipify"))
      this.tooltipifyContent(doc, target);
  }, 

  linkifyContent : function(doc, target) {
    var textnodes = this.xpathNodes(doc,
      "descendant::text()[contains(translate(., 'BUG', 'bug'),'bug')]", target);

    for(var i = 0, len = textnodes.length; i < len; i++) {
      var node = textnodes[i];
      /* handle one match at a time so we can get index of regex */
      while(node.data) {
        var matches = this.bugExp.exec(node.data);
        var urlmatches = this.urlExp.exec(node.data);

        // we need to make sure we don't skip over plain text urls
        if(matches && (!urlmatches || matches.index < urlmatches.index)) {
          var index = matches.index;
          var prelen = matches[1].length;
          var bugtext = matches[2];
          var url = this.baseUrl + "id=" + matches[3];
        }
        else if (urlmatches) {
          var index = urlmatches.index;
          var prelen = 0;
          var bugtext = urlmatches[0];
          var url = "http://" + urlmatches[1];
        }
        else
          break;
        
        /* snip out bug id */
        var bug = node.splitText(index + prelen);
        node = bug.splitText(bugtext.length);

        var anchor = doc.createElement("a");
        var text = doc.createTextNode(bugtext);
        anchor.appendChild(text);
        anchor.className = "__firefox_bugidhelper";
        
                                        
        /* insert link */
        node.parentNode.replaceChild(anchor, bug);

        if(this.canSetHref(doc, anchor))
         this.setLink(anchor, url);
      }
    }
  },

  setLink : function(element, url) {
    element.setAttribute("href", url);
    if(this.getBoolPref("link.diverted"))
      element.setAttribute("target", "_blank");
  },

  /*--- tooltip ---*/
  tooltipifyContent : function(doc, target) {
    var links = this.xpathNodes(doc, 'descendant::a[contains(@href, "show_bug.cgi")]', target);
    if(links.length > 0) {
      var login = this.getLogin();
      if(login.username) {
        var userUrl = this.prefService.getCharPref("extensions.bugid.url");
        bugzillaRPC.setUrl(this.toBugzillaDomain(userUrl));
        bugzillaRPC.login(login.username, login.password,
                          function(){ bugIdHelper.tooltipifyLinks(doc, links);},
                          function(){ bugIdHelper.tooltipifyLinks(doc, links);});
      }
      else
        this.tooltipifyLinks(doc, links);
    }
    else
      this.tooltipifyLinks(doc, links);
  },

  tooltipifyLinks : function(doc, links) {
    for(var i = 0; i < links.length; i++) {
      var link = links[i];
      var matches = bugIdHelper.urlExp.exec(link.getAttribute("href"));
      if(matches) {
        var base = matches[2];
        if(base.length < 15)  // on a bugzilla domain -override tooltip 
          base = bugIdHelper.domainExp.exec(doc.location.href)[1] + "/show_bug.cgi?";
        var url = "http://" + base + "ctype=xml&excludefield=attachment&id=" + matches[3];
        var commentId = matches[4];
        if(commentId)
          bugIdHelper.setComment(link, url, commentId);
        else
          bugIdHelper.setTooltip(link, url);
      }
    }
  },

  setTooltip : function(element, url) {
    this.xhr(url,
      function(wasSuccess, xml) {
        if(!bugIdHelper) // this happens sometimes
          return;
        var showerror = bugIdHelper.getBoolPref("tooltip.showerror");
        if(!wasSuccess) {
          if(showerror)
            element.title = bugIdHelper.strings.getFormattedString("invalidPage", [url]);
          return;
        }
        var bug = xml.getElementsByTagName("bug");
        if(bug && bug[0] && bug[0].hasAttribute("error")) {
          var error = bug[0].getAttribute("error");
          if(showerror)
            element.title = bugIdHelper.strings.getFormattedString("invalidId",
		                                                 [bugIdHelper.userUrl, error]);
          return;
        }
        var tooltip = [];
        if(bugIdHelper.getBoolPref("tooltip.showid"))
          tooltip.push(bugIdHelper.strings.getString("bug") + " " +
                       bugIdHelper.bugAttribute(xml, "bug_id"));
        if(bugIdHelper.getBoolPref("tooltip.showstat")) {
           var status = bugIdHelper.bugAttribute(xml, "bug_status");
           var reso = bugIdHelper.bugAttribute(xml, "resolution");
           if(reso)
             tooltip.push(status + " " + reso);
           else
             tooltip.push(status);
        }
        if(bugIdHelper.getBoolPref("tooltip.showcomp")) {
          var prod = bugIdHelper.bugAttribute(xml, "product");
          var comp = bugIdHelper.bugAttribute(xml, "component");
          tooltip.push(prod + "/" + comp);
        }
        if(bugIdHelper.getBoolPref("tooltip.showdate"))
          tooltip.push(bugIdHelper.toDate(bugIdHelper.bugAttribute(xml, "creation_ts")));
        if(bugIdHelper.getBoolPref("tooltip.showassign"))
          tooltip.push(bugIdHelper.bugAttribute(xml, "assigned_to"));
        if(bugIdHelper.getBoolPref("tooltip.showdesc"))
          tooltip.push(bugIdHelper.bugAttribute(xml, "short_desc"));

        if(bugIdHelper.getBoolPref("link.strikethrough")) {
          var reso = bugIdHelper.bugAttribute(xml, "resolution");
          if(bugIdHelper.strikeResos.indexOf(reso) != -1)
            element.style.textDecoration = "underline line-through";
        }

        /* set title attribute to tooltip text */
        element.title = tooltip.join(" -- ");
     });
  },

  setComment : function(element, url, cid) {
    this.xhr(url, 
      function(wasSuccess, xml) {
        if(!bugIdHelper) // this happens sometimes
          return;
        var showerror = bugIdHelper.getBoolPref("tooltip.showerror");
        if(!wasSuccess) {
          if(showerror)
            element.title = bugIdHelper.strings.getFormattedString("invalidPage", [url]);
          return;
        }
        var bug = xml.getElementsByTagName("bug");
        if(bug && bug[0] && bug[0].hasAttribute("error")) {
          var error = bug[0].getAttribute("error");
          if(showerror)
            element.title = bugIdHelper.strings.getFormattedString("invalidId", 
                            [bugIdHelper.userUrl, error]);
          return;
        }
        /* set title attribute to comment text */
        var comment = xml.getElementsByTagName("long_desc")[cid];
        if(comment) {
          var text = bugIdHelper.bugAttribute(comment, "thetext");
          var tooltip = "";
          if(bugIdHelper.getBoolPref("tooltip.showcommenter"))
            tooltip += bugIdHelper.bugAttribute(comment, "who") + " -- ";
          element.title = tooltip + text.substring(0, Math.min(text.length, 180)) + " ..."; 
        }
     });
  },
 
  /* Adapted from browser.js - Firefox. Adds full tooltip support to Thunderbird content */
  fillTBirdTooltip : function(tipElement) {
    var retVal = false;
    if (tipElement.namespaceURI == "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul")
      return retVal;
    const XLinkNS = "http://www.w3.org/1999/xlink";
    var titleText = null;
    var XLinkTitleText = null;
    var direction = tipElement.ownerDocument.dir;

    while (!titleText && !XLinkTitleText && tipElement) {
      if (tipElement.nodeType == Node.ELEMENT_NODE) {
        titleText = tipElement.getAttribute("title");
        XLinkTitleText = tipElement.getAttributeNS(XLinkNS, "title");
        var defView = tipElement.ownerDocument.defaultView;
        // Work around bug 350679: "Tooltips can be fired in documents with no view"
        if (!defView)
          return retVal;
        direction = defView.getComputedStyle(tipElement, "")
          .getPropertyValue("direction");
      }
      tipElement = tipElement.parentNode;
    }

    var tipNode = document.getElementById("bugidTooltip");
    tipNode.style.direction = direction;
  
    for each (var t in [titleText, XLinkTitleText]) {
      if (t && /\S/.test(t)) {
        // Per HTML 4.01 6.2 (CDATA section), literal CRs and tabs should be
        // replaced with spaces, and LFs should be removed entirely
        t = t.replace(/[\r\t]/g, ' ');
        t = t.replace(/\n/g, '');

        tipNode.setAttribute("label", t);
        retVal = true;
      }
    }
    return retVal;
  },

  /*--- utility functions ---*/
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

  toDomainRegex : function(userDomain) {
    if(userDomain.indexOf("://") != -1)
      return new RegExp("^" + userDomain);
    return new RegExp("^(?:https?|file):\/\/(www\.)?" + userDomain);
  },

  toDomains : function(urlStr) {
    var urls = urlStr.split(/[\s,;]+/);
    var domains = [];
    for(var i = 0, len = urls.length; i < len; i++) 
       domains.push(this.toDomainRegex(urls[i]));
    return domains;
  },

  /* return true if can linkify and add tooltips to this document */
  canBugify : function(doc) {
    if(!doc.location || doc.location.href.indexOf("about:") == 0)
      return false;
    if(!this.getBoolPref("linkify") && !this.getBoolPref("tooltipify"))
      return false;
    if(this.prefService.getBoolPref("extensions.bugid.filter")) {
      var isValidDomain = false;
      for(var i = 0, len = this.domainExps.length; i < len; i++) {
        if(this.domainExps[i].test(doc.location.href))
          isValidDomain = true;
      }
      return isValidDomain;
    }
    return true;
  },

  canSetHref : function(doc, elem) {
    return !this.xpathBool(doc,
      "boolean(ancestor-or-self::*[@href])", elem);
  },

  canSetTitle : function(doc, elem) {
    return !this.xpathBool(doc,
      "boolean(ancestor-or-self::*[@title or @onmouseover])", elem);
  },

  canLink : function(doc, elem) {
    return !this.xpathBool(doc, "boolean(ancestor-or-self::*[@class='__firefox_bugidhelper'])");
  },

  getBoolPref : function(pref) {
    return this.prefService.getBoolPref("extensions.bugid." + pref);
  },

  getLogin : function() {
    if ("@mozilla.org/passwordmanager;1" in Components.classes) {
      // Thunderbird 2
      var passwordManager = Components.classes["@mozilla.org/passwordmanager;1"]
                            .getService(Components.interfaces.nsIPasswordManager);
      var e = passwordManager.enumerator;
      while (e.hasMoreElements()) {
        var loginInfo = e.getNext().QueryInterface(Components.interfaces.nsIPassword);
        if (loginInfo.host == bugIdHelper.hostUrl)
          return {username: loginInfo.user, password: loginInfo.password};
      }
    }
    else if ("@mozilla.org/login-manager;1" in Components.classes) {
      // Thunderbird 3, Firefox 3
      var loginManager = Components.classes["@mozilla.org/login-manager;1"]
                          .getService(Components.interfaces.nsILoginManager);

      var logins = loginManager.findLogins({}, bugIdHelper.hostUrl, "", null);
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
