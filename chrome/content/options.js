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
 * The Original Code is Bug ID Helper
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
var hostUrl = "chrome://bugid/content/options.xul";

/* toggle disabled attribute of all children */
function togglePrefs(className, toggleId) {
 var disable = !document.getElementById(toggleId).checked;
 var elems = xpathNodes(document, 
   './/*[contains(concat(" ",normalize-space(@class)," ")," ' + className + ' ")]');
 for(var i = 0, len = elems.length; i < len; i++)
   elems[i].disabled = disable;
}

function xpathNodes(doc, expression, element) {
  var target = element || doc;
  var results = [];
  var query = doc.evaluate(expression, target,
        null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
  for (var i = 0, len = query.snapshotLength; i < len; i++)
    results.push(query.snapshotItem(i));
  return results;
}

function saveLogin() {
  var username = document.getElementById("loginbox").value;
  var password = document.getElementById("passbox").value;
  var url = document.getElementById("urlbox").value;
  var oldLogin = getLogin();

  if(!username || !password) {
    // if they remove their username/password, delete they're login
    if ("@mozilla.org/passwordmanager;1" in Components.classes) {
      // Thunderbird 2
      var passwordManager = Components.classes["@mozilla.org/passwordmanager;1"]
                            .getService(Components.interfaces.nsIPasswordManager);
      if(oldLogin.username)
        passwordManager.removeUser(hostUrl, oldLogin.username);
    }
    else if ("@mozilla.org/login-manager;1" in Components.classes) {
      // Thunderbird 3, Firefox 3
      var loginManager = Components.classes["@mozilla.org/login-manager;1"]
                         .getService(Components.interfaces.nsILoginManager);
      var nsLoginInfo = new Components.Constructor(
                        "@mozilla.org/login-manager/loginInfo;1",
                         Components.interfaces.nsILoginInfo,
                        "init");
      var logins = loginManager.findLogins({}, hostUrl, "", null);

      if(logins.length > 0) {
        // they're changing their username or password
        var oldLogin = new nsLoginInfo(hostUrl, "", null, logins[0].username,
                                       logins[0].password, "loginbox", "passbox");
        loginManager.removeLogin(logins[0]);
      }
    }
    return;
  }

  if ("@mozilla.org/passwordmanager;1" in Components.classes) {
    // Thunderbird 2
    var passwordManager = Components.classes["@mozilla.org/passwordmanager;1"]
                          .getService(Components.interfaces.nsIPasswordManager);
    if(oldLogin.username) {
      passwordManager.removeUser(hostUrl, oldLogin.username); }
    passwordManager.addUser(hostUrl, username, password);
  }
  else if ("@mozilla.org/login-manager;1" in Components.classes) {
    // Thunderbird 3, Firefox 3
    var loginManager = Components.classes["@mozilla.org/login-manager;1"]
                        .getService(Components.interfaces.nsILoginManager);
    var nsLoginInfo = new Components.Constructor(
                      "@mozilla.org/login-manager/loginInfo;1",
                       Components.interfaces.nsILoginInfo,
                      "init");
    var loginInfo = new nsLoginInfo(hostUrl, "", null, username,
                                    password, "loginbox", "passbox");
    var logins = loginManager.findLogins({}, hostUrl, "", null);

    if(logins.length > 0) {
      // they're changing their username or password
      var oldLogin = new nsLoginInfo(hostUrl, "", null, logins[0].username,
                                     logins[0].password, "loginbox", "passbox");
      loginManager.modifyLogin(logins[0], loginInfo);
    }
    else
      loginManager.addLogin(loginInfo);
  }

  bugzillaRPC.setUrl(toBugzillaDomain(url));
  bugzillaRPC.login(username, password,
                    function(){ try{ alert('Successfully logged in');} catch(e){}},
                    function(errMsg){ try{alert("Could not log in: " + errMsg);} catch(e){}});
}

function fillLogin() {
  var userField = document.getElementById("loginbox");
  var passField = document.getElementById("passbox");
  var login = getLogin();
  userField.value = login.username;
  passField.value = login.password;
}

function getLogin() {
  if ("@mozilla.org/passwordmanager;1" in Components.classes) {
    // Thunderbird 2
    var passwordManager = Components.classes["@mozilla.org/passwordmanager;1"]
                          .getService(Components.interfaces.nsIPasswordManager);
    var e = passwordManager.enumerator;
    while (e.hasMoreElements()) {
      var loginInfo = e.getNext().QueryInterface(Components.interfaces.nsIPassword);
      if (loginInfo.host == hostUrl)
        return {username:loginInfo.user, password: loginInfo.password};
    }
  }
  else if ("@mozilla.org/login-manager;1" in Components.classes) {
    // Thunderbird 3, Firefox 3
    var loginManager = Components.classes["@mozilla.org/login-manager;1"]
                          .getService(Components.interfaces.nsILoginManager);

    var logins = loginManager.findLogins({}, hostUrl, "", null);
    if(logins.length > 0)
      return logins[0];
  }
  return {username:'', password:''};
}

function toBugzillaDomain(fragment) {
  var domExp = /^(?:https?:\/\/)?([\w\.\/]*?)\/?(?:show_bug\.cgi\?id=)?$/;
  var matches = fragment.match(domExp);
  if(matches)
    return "https://" + matches[1] + "/";
}
