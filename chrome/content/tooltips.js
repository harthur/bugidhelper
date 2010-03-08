var bugidTooltip = {
  tooltipifyContent : function(doc, target) {
    var links = bugidHelper.xpathNodes(doc, 'descendant::a[contains(@href, "show_bug.cgi")]', target);
    if(links.length > 0) {
      var login = bugidHelper.getLogin();
      if(login.username) {
        var userUrl = bugidHelper.prefs.getCharPref("url");
        bugzillaRPC.setUrl(bugidHelper.toBugzillaDomain(userUrl));
        bugzillaRPC.login(login.username, login.password,
                          function(){ bugidTooltip.tooltipifyLinks(doc, links);},
                          function(){ bugidTooltip.tooltipifyLinks(doc, links);});
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
      var matches = bugidHelper.urlExp.exec(link.getAttribute("href"));
      if(matches) {
        var base = matches[2];
        if(base.length < 15)  // on a bugzilla domain -override tooltip 
          base = bugidHelper.domainExp.exec(doc.location.href)[1] + "/show_bug.cgi?";
        var url = "http://" + base + "ctype=xml&excludefield=attachment&id=" + matches[3];
        var commentId = matches[4];
        if(commentId)
          bugidTooltip.setComment(link, url, commentId);
        else
          bugidTooltip.setTooltip(link, url);
      }
    }
  },

  setTooltip : function(element, url) {
    bugidHelper.xhr(url,
      function(wasSuccess, xml) {
        if(!bugidHelper) // this happens sometimes
          return;
        if(!wasSuccess) {
          element.title = bugidHelper.strings.getFormattedString("invalidPage", [url]);
          return;
        }
        var bug = xml.getElementsByTagName("bug");
        if(bug && bug[0] && bug[0].hasAttribute("error")) {
          var error = bug[0].getAttribute("error");
          var userUrl = bugidHelper.prefs.getCharPref("url");
          element.title = bugidHelper.strings.getFormattedString("invalidId",
		                                   [userUrl, error]);
          return;
        }
        var tooltip = [];
        if(bugidHelper.getBoolPref("tooltip.showid"))
          tooltip.push(bugidHelper.strings.getString("bug") + " " +
                       bugidHelper.bugAttribute(xml, "bug_id"));
        if(bugidHelper.getBoolPref("tooltip.showstat")) {
           var status = bugidHelper.bugAttribute(xml, "bug_status");
           var reso = bugidHelper.bugAttribute(xml, "resolution");
           if(reso)
             tooltip.push(status + " " + reso);
           else
             tooltip.push(status);
        }
        if(bugidHelper.getBoolPref("tooltip.showcomp")) {
          var prod = bugidHelper.bugAttribute(xml, "product");
          var comp = bugidHelper.bugAttribute(xml, "component");
          tooltip.push(prod + "/" + comp);
        }
        if(bugidHelper.getBoolPref("tooltip.showdate"))
          tooltip.push(bugidHelper.toDate(bugidHelper.bugAttribute(xml, "creation_ts")));
        if(bugidHelper.getBoolPref("tooltip.showassign"))
          tooltip.push(bugidHelper.bugAttribute(xml, "assigned_to"));
        if(bugidHelper.getBoolPref("tooltip.showdesc"))
          tooltip.push(bugidHelper.bugAttribute(xml, "short_desc"));

        if(bugidHelper.getBoolPref("link.strikethrough")) {
          var resolution = bugidHelper.bugAttribute(xml, "resolution");
          var resos = bugidHelper.prefs.getCharPref("link.strike.resos").split(/[\.,\s]+/);
          if(resos.indexOf(resolution) != -1)
            element.style.textDecoration = "underline line-through";
        }

        /* set title attribute to tooltip text */
        element.title = tooltip.join(" -- ");
     });
  },

  setComment : function(element, url, cid) {
    bugidHelper.xhr(url, 
      function(wasSuccess, xml) {
        if(!bugidHelper) // this happens sometimes
          return;
        if(!wasSuccess) {
          element.title = bugidHelper.strings.getFormattedString("invalidPage", [url]);
          return;
        }
        var bug = xml.getElementsByTagName("bug");
        if(bug && bug[0] && bug[0].hasAttribute("error")) {
          var error = bug[0].getAttribute("error");
          var userUrl = bugidHelper.prefs.getCharPref("url");
          element.title = bugidHelper.strings.getFormattedString("invalidId", 
                            [userUrl, error]);
          return;
        }
        /* set title attribute to comment text */
        var comment = xml.getElementsByTagName("long_desc")[cid];
        if(comment) {
          var text = bugidHelper.bugAttribute(comment, "thetext");
          var tooltip = "";
          tooltip += bugidHelper.bugAttribute(comment, "who") + " -- ";
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
}
