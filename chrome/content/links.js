bugidLinks = {
  linkifyContent : function(doc, target) {
    var textnodes = bugidHelper.xpathNodes(doc,
      "descendant::text()[contains(translate(., 'BUG', 'bug'),'bug')]", target);

    for(var i = 0, len = textnodes.length; i < len; i++) {
      var node = textnodes[i];
      /* handle one match at a time so we can get index of regex */
      while(node.data) {
        var matches = bugidHelper.bugExp.exec(node.data);
        var urlmatches = bugidHelper.urlExp.exec(node.data);

        // we need to make sure we don't skip over plain text urls
        if(matches && (!urlmatches || matches.index < urlmatches.index)) {
          var index = matches.index;
          var prelen = matches[1].length;
          var bugtext = matches[2];
          var url = bugidHelper.baseUrl + "id=" + matches[3];
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
        anchor.className = "__firefox_bugidHelper";
        
                                        
        /* insert link */
        node.parentNode.replaceChild(anchor, bug);

        if(bugidHelper.canSetHref(doc, anchor))
         this.setLink(anchor, url);
      }
    }
  },

  setLink : function(element, url) {
    element.setAttribute("href", url);
    if(bugidHelper.getBoolPref("link.diverted"))
      element.setAttribute("target", "_blank");
  },
}
