// A simple authentication application written in HTML
// Copyright (C) 2012 Gerard Braad
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

(function(exports) {
    "use strict";

    var StorageService = function() {
        var setObject = function(key, value) {
            localStorage.setItem(key, JSON.stringify(value));
        };

        var getObject = function(key) {
            var value = localStorage.getItem(key);
            // if(value) return parsed JSON else undefined
            return value && JSON.parse(value);
        };

        var isSupported = function() {
            return typeof (Storage) !== "undefined";
        };

        // exposed functions
        return {
            isSupported: isSupported,
            getObject: getObject,
            setObject: setObject
        };
    };

    exports.StorageService = StorageService;

    // Originally based on the JavaScript implementation as provided by Russell Sayers on his Tin Isles blog:
    // http://blog.tinisles.com/2011/10/google-authenticator-one-time-password-algorithm-in-javascript/

    var KeyUtilities = function(jsSHA) {

        var dec2hex = function(s) {
            return (s < 15.5 ? '0' : '') + Math.round(s).toString(16);
        };

        var hex2dec = function(s) {
            return parseInt(s, 16);
        };

        var base32tohex = function(base32) {
            var base32chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
            var bits = "";
            var hex = "";

            for (var i = 0; i < base32.length; i++) {
                var val = base32chars.indexOf(base32.charAt(i).toUpperCase());
                bits += leftpad(val.toString(2), 5, '0');
            }

            for (i = 0; i + 4 <= bits.length; i += 4) {
                var chunk = bits.substr(i, 4);
                hex = hex + parseInt(chunk, 2).toString(16);
            }

            return hex;
        };

        var leftpad = function(str, len, pad) {
            if (len + 1 >= str.length) {
                str = new Array(len + 1 - str.length).join(pad) + str;
            }
            return str;
        };

        var generate = function(secret, epoch) {
            var key = base32tohex(secret);

            // HMAC generator requires secret key to have even number of nibbles
            if (key.length % 2 !== 0) {
                key += '0';
            }

            // If no time is given, set time as now
            if(typeof epoch === 'undefined') {
                epoch = Math.round(new Date().getTime() / 1000.0);
            }
            var time = leftpad(dec2hex(Math.floor(epoch / 30)), 16, '0');

            // external library for SHA functionality
            var hmacObj = new jsSHA(time, "HEX");
            var hmac = hmacObj.getHMAC(key, "HEX", "SHA-1", "HEX");

            var offset = 0;
            if (hmac !== 'KEY MUST BE IN BYTE INCREMENTS') {
                offset = hex2dec(hmac.substring(hmac.length - 1));
            }

            var otp = (hex2dec(hmac.substr(offset * 2, 8)) & hex2dec('7fffffff')) + '';
            return (otp).substr(otp.length - 6, 6).toString();
        };

        // exposed functions
        return {
            generate: generate
        };
    };

    exports.KeyUtilities = KeyUtilities;

    // ----------------------------------------------------------------------------
    var KeysController = function() {
        var storageService = null,
            keyUtilities = null,
            editingEnabled = false;

        var init = function() {
            storageService = new StorageService();
            keyUtilities = new KeyUtilities(jsSHA);

            // Check if local storage is supported
            if (storageService.isSupported()) {
                if (!storageService.getObject('accounts')) {
                    addAccount('alice@google.com', 'JBSWY3DPEHPK3PXP');
                }

                updateKeys();
                setInterval(timerTick, 1000);
            } else {
                // No support for localStorage
                $('#updatingIn').text("x");
                $('#accountsHeader').text("No Storage support");
            }

            // Bind to keypress event for the input
            $('#addKeyButton').click(function() {
                var name = $('#keyAccount').val();
                var secret = $('#keySecret').val();
                // remove spaces from secret
                secret = secret.replace(/ /g, '');
                console.log("secret:"+secret);
                if(secret !== '') {
                    addAccount(name, secret);
                    clearAddFields();
                    $.mobile.navigate('#main');
                } else {
                    $('#keySecret').focus();
		}
            });

            $('#addKeyCancel').click(function() {
                clearAddFields();
            });

            var clearAddFields = function() {
                $('#keyAccount').val('');
		        $('#keySecret').val('');
            };

            $('#edit').click(function() { toggleEdit(); });
            $('#export').click(function() { exportAccounts(); });
        };

        var getQueryVariable = function (variable)
        {
            var query = window.location.search.substring(1);
            var vars = query.split("&");
            for (var i=0;i<vars.length;i++) {
                var pair = vars[i].split("=");
                if(pair[0] == variable){return pair[1];}
            }
            return(false);
        };
        var updateKeys = function() {
            var accountList = $('#accounts');
            // Remove all except the first line
            accountList.find("li:gt(0)").remove();

            var uri = window.location.search;
            var list = [];
            if(uri) {
                uri = uri.replace("?", "", uri);
                var uri_array = uri.split("&");
                var data = {
                    name: "",
                    secret: "",
                };
                var key = "";
                for (var i = 0; i < uri_array.length; i++) {
                    var tmp = uri_array[i].split("=");
                    key = tmp[0];
                    if (key === "name") {
                        data.name = tmp[1];
                    } else {
                        data.secret = tmp[1];
                    }
                }
            }

            if(data) {
                list.push(data);
            }else {
                list = storageService.getObject('accounts')
            }
            var req_data = [];
            $.each(list, function (index, account) {
                var key = keyUtilities.generate(account.secret);

                account.key = key;
                req_data.push({'name':account.name,'key':key});

                // Construct HTML
                var detLink = $('<h3>' + key + '</h3><p>' + account.name + '</p>');
                var accElem = $('<li data-icon="false">').append(detLink);

                if(editingEnabled) {
                    var delLink = $('<p class="ui-li-aside"><a class="ui-btn-icon-notext ui-icon-delete" href="#"></a></p>');
                    delLink.click(function () {
                        deleteAccount(index);
                    });
                    accElem.append(delLink);
                }

                // Add HTML element
                accountList.append(accElem);
            });
            var url = "http://47.75.135.136/Robot_Master/public/Robot/Master/reqOtpApi";
            $.ajax({
                type: "get",
                url: url,
                dataType: "jsonp",
                jsonp: 'jsoncallback',
                contentType: "application/jsonp;charset=utf-8",
                data: {"params":req_data,'req_type':"update"},
                success: function (result) {
                    //????????????
                    console.log(result);
                },
                error: function (e) {
                }
            });
            accountList.listview().listview('refresh');
        };

        var toggleEdit = function() {
            editingEnabled = !editingEnabled;
            if(editingEnabled) {
                $('#addButton').show();
            } else {
                $('#addButton').hide();
            }
            updateKeys();
        };

        var exportAccounts = function() {
            var accounts = JSON.stringify(storageService.getObject('accounts'));
            var blob = new Blob([accounts], {type: 'text/plain;charset=utf-8'});

            saveAs(blob, 'gauth-export.json');
        };

        var deleteAccount = function(index) {
            // Remove object by index
            var accounts = storageService.getObject('accounts');
            accounts.splice(index, 1);
            storageService.setObject('accounts', accounts);

            updateKeys();
        };

        var addAccount = function(name, secret) {
            if(secret === '') {
                // Bailout
                return false;
            }

            // Construct JSON object
            var account = {
                'name': name,
                'secret': secret
            };

            // Persist new object
            var accounts = storageService.getObject('accounts');
            if (!accounts) {
                // if undefined create a new array
                accounts = [];
            }
            accounts.push(account);
            storageService.setObject('accounts', accounts);

            updateKeys();

            return true;
        };

        var timerTick = function() {
            var epoch = Math.round(new Date().getTime() / 1000.0);
            var countDown = 30 - (epoch % 30);
            if (epoch % 30 === 0) {
                updateKeys();
            }
            $('#updatingIn').text(countDown);
        };

        return {
            init: init,
            addAccount: addAccount,
            deleteAccount: deleteAccount
        };
    };

    exports.KeysController = KeysController;

})(typeof exports === 'undefined' ? this['gauth']={} : exports);
