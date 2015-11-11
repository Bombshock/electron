/*global angular*/

(function () {
  'use strict';

  var Q = require("q");

  angular.module("app").service("execute", executeService);

  executeService.$inject = ["CMDMessage", "bash", "mainProcess"];

  function executeService(CMDMessage, bash, mainProcess) {

    function spawn() {
      /*jshint -W040*/
      return require("child_process").spawn.apply(this, arguments);
    }

    function execute(line, tab, cwd) {
      var input = line;
      var args = input.split(" ");
      var bin = args.shift();
      var regexString = args.join(" ");
      var escaped = false;
      var last = null;
      var soFar = "";

      args = [];

      for (var i = 0; i < regexString.length; i++) {
        var char = regexString[i];
        if (char === '"' && last !== "\\") {
          escaped = !escaped;
        } else if (char === " " && !escaped && i !== 0) {
          args.push(soFar);
          soFar = "";
        } else if(char !== "\\") {
          soFar += char;
        }
        last = char;
      }

      args.push(soFar);

      cwd = cwd || tab.cwd;

      console.log("submit", input);

      if (tab.history[tab.history.length - 1] !== input) {
        tab.history.push(input);
      }

      var message = new CMDMessage(cwd + "> " + input, CMDMessage.TYPE_COMMAND);
      tab.lines.push(message);
      tab.historyIndex = null;

      if (!line) {
        return;
      }

      if (bin in bash) {
        Q.when(bash[bin].apply(bash[bin], [args, stdout, stderr, tab]))
            .finally(function () {
              mainProcess.$emit("cycle");
            });
      } else {
        args.unshift(bin);
        args = ["/s", "/c"].concat(args);
        console.log("args", args);
        // cmd "/s", "/c"
        // PowerShell "-NoProfile", "-NonInteractive", "-NoLogo", "-ExecutionPolicy", "Bypass", "-Command"
        tab.child = spawn("cmd", args, {
          cwd: cwd
        });

        tab.child.command = input;
        tab.child.cwd = tab.cwd;
        tab.child.msg = message;

        tab.child.stdout.on('data', stdout);

        tab.child.stderr.on('data', stderr);

        tab.child.on('close', function (code) {
          console.log('child process exited with code ' + code);
          if (code !== 0) {
            tab.lines.push(new CMDMessage('child process exited with code ' + code, CMDMessage.TYPE_SUCCESS));
          }
          tab.child = null;

          mainProcess.$emit("cycle");
        });
      }

      function stdout(msg) {
        if (msg instanceof Buffer) {
          for (var i = 0; i < msg.length; i++) {
            var char = msg[i];
            switch (char) {
              case 12:
                tab.lines = [];
                msg = "";
                break;
            }
          }
        }

        msg = msg.toString();

        if (msg.length > 0) {
          tab.lines.push(new CMDMessage(msg));
        }

        mainProcess.$emit("cycle");
      }

      function stderr(msg) {
        if (msg instanceof Buffer) {
          msg = msg.asciiSlice();
        } else {
          msg = msg.stack ? msg.stack : msg.toString();
        }

        tab.lines.push(new CMDMessage(msg, CMDMessage.TYPE_ERROR));
        mainProcess.$emit("cycle");
      }
    }

    return execute;
  }

})();