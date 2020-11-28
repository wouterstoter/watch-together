var api;
var laststate;
var ignore = false;
var src;
var fileupload = {};
window.addEventListener('DOMContentLoaded', (event) => {
  try {
    var roomName = (document.location.hash || (document.location.hash = "#" + (prompt("Please enter room name") || Math.random().toString(36).substring(2)))).slice(1)
    api = new JitsiMeetExternalAPI('meet.jit.si', {
      roomName: "watch-together/" + roomName,
      width: "100%",
      height: "100%",
      parentNode: document.querySelector('#meet'),
      configOverwrite: {},
      interfaceConfigOverwrite: {
        APP_NAME: 'Watch Together',
        NATIVE_APP_NAME: 'Watch Together',
        MOBILE_APP_PROMO: false,
        HIDE_INVITE_MORE_HEADER: true,
        TOOLBAR_ALWAYS_VISIBLE: false,
        VIDEO_QUALITY_LABEL_DISABLED: true,
        INITIAL_TOOLBAR_TIMEOUT: 1,
        CONNECTION_INDICATOR_AUTO_HIDE_TIMEOUT: 1,
        TOOLBAR_TIMEOUT: 1,
        TOOLBAR_BUTTONS: [],
        SHOW_CHROME_EXTENSION_BANNER: false,
        DEFAULT_BACKGROUND: "#FF000080",
        DEFAULT_REMOTE_DISPLAY_NAME: 'Fellow Watcher'
      }
    });
    api.addEventListener("videoConferenceJoined", function(e){
      document.querySelector("#meet").classList.remove("fullscreen");
      document.querySelector("#meet").classList.add("smallscreen");
      document.querySelector("#meet").classList.remove("no_controls");
      api.executeCommand('subject', ' ');
      setTimeout(e => {
        if (Object.keys(api._participants).length > 1) api.executeCommand("sendEndpointTextMessage",Object.keys(api._participants).filter(a => a != api._myUserID)[0],"stateRequest")
      },1000)
    });
    api.addEventListener("videoConferenceLeft", function(e){
      document.querySelector("#meet").classList.add("fullscreen");
      document.querySelector("#meet").classList.remove("smallscreen");
      document.querySelector("#meet").classList.add("no_controls");
    });
    api.addEventListener("readyToClose", function(e){
      document.querySelector("#meet").style.display = "none";
    });
    api.addEventListener("audioMuteStatusChanged", function(e){
      document.querySelector("#meet > #controls > #mic").innerText = e.muted ? "mic_off" : "mic";
    });
    api.addEventListener("videoMuteStatusChanged", function(e){
      document.querySelector("#meet > #controls > #videocam").innerText = e.muted ? "videocam_off" : "videocam";
    });
  } catch(e) {
    document.querySelector("#meet").classList.remove("fullscreen");
    document.querySelector("#meet").classList.add("smallscreen");
    document.querySelector("#meet").classList.add("no_controls");
  }
  
  api.addEventListener("endpointTextMessageReceived", async function(e){
    var data = e.data.eventData.text;
    console.log(data);
    if (data == "stateRequest") {
      laststate = {
        "src":src,
        "paused":video.paused,
        "currentTime":video.currentTime,
        "event":"stateRequest",
        "playbackRate":video.playbackRate,
      }
      api.executeCommand("sendEndpointTextMessage",e.data.senderInfo.id,laststate)
    } else if (data.event == "remove") {
      remove();
    }  else if (data.event == "upload") {
      if (data.progress == "start") {
        video.pause();
        document.querySelector("div#upload > i").innerText = data.name;
        document.querySelector("div#upload").style.display = "";
        document.querySelector("div#overlay").style.display = "none";
      } else if (data.progress == "done") {
        document.querySelector("div#upload > i").innerText = "video";
        document.querySelector("div#upload").style.display = "none";
        document.querySelector("div#upload > progress").value = 0;
      } else {
        document.querySelector("div#upload > progress").value = data.progress;
      }
    } else if (!laststate || JSON.stringify(laststate, Object.keys(laststate).sort()) != JSON.stringify(data, Object.keys(data).sort())) {
      ignore = true;
      if (data.src && src != data.src) {src = data.src;loadVid();}
      if (data.event == "waiting" || data.event == "pause" || data.event == "seeked" || data.event == "stateRequest") {
        if (Math.abs(data.currentTime - video.currentTime) > 0.5 && (!laststate || data.currentTime != laststate.currentTime)) video.currentTime = data.currentTime;
      }
      if (data.playbackRate != video.playbackRate) video.playbackRate = data.playbackRate;
      if (data.paused != video.paused && data.event != "waiting") data.paused ? await video.pause() : await video.play();
      if (data.event == "waiting") await video.pause();
      laststate = data;
      setTimeout(a => {ignore = false},100)
    }
  });
  const video = document.querySelector('video');
  function sendState(e){
    document.querySelector("button#play").innerText = video.paused ? "play_arrow" : "pause";
    if (!ignore) {
      console.log(e);
      for (participantId in api._participants) {
        laststate = {
          "src":src,
          "paused":video.paused,
          "currentTime":video.currentTime,
          "event":e.type,
          "playbackRate":video.playbackRate,
        }
        api.executeCommand("sendEndpointTextMessage",participantId,laststate)
      }
    }
  }
  function open(){
    src = prompt("What is the URL of the video you want to play?")
    sendState({"type":"newVid"});
    loadVid();
  }
  function upload() {
    deleteFile();
    fileupload = {};
    var input = document.createElement("input");
    input.setAttribute("type", "file");
    input.setAttribute("accept", "video/*");
    input.onchange = function() {
      if (this.files.length > 0) {
        fileupload.file = this.files[0];
        document.querySelector("video").style.display = "";
        fileupload.objectURL = URL.createObjectURL(fileupload.file);
        video.src = fileupload.objectURL;
        fetch('https://apiv2.gofile.io/getServer')
          .then(response => response.json())
          .then(data => {
            if (data.status != "ok") return;
            fileupload.server = data.data.server;
            var formData = new FormData();
            formData.append("file",fileupload.file);
            fileupload.expire = new Date();
            fileupload.expire.setSeconds(fileupload.expire.getSeconds()+(document.querySelector("video").duration || 60*60)*1.5);
            fileupload.expire.setHours(fileupload.expire.getHours()+1);
            formData.append("expire",Math.round(Number(fileupload.expire) / 1000));
            var xhr = new XMLHttpRequest();
            xhr.open("POST", "https://" + fileupload.server + ".gofile.io/uploadFile");
            xhr.upload.onprogress = function (e) {
              if (e.lengthComputable) {
                video.currentTime = Math.round(e.loaded / e.total * 20) / 20 * video.duration;
                document.querySelector("div#upload > progress").value = e.loaded / e.total;
                for (participantId in api._participants) {
                  api.executeCommand("sendEndpointTextMessage",participantId,{
                    "name":fileupload.file.name,
                    "event":"upload",
                    "progress":e.loaded / e.total,
                  })
                }
              }
            }
            xhr.upload.onloadstart = function (e) {
              ignore = true;
              video.pause();
              document.querySelector("div#upload > i").innerText = fileupload.file.name;
              document.querySelector("div#upload").style.display = "";
              for (participantId in api._participants) {
                api.executeCommand("sendEndpointTextMessage",participantId,{
                  "name":fileupload.file.name,
                  "event":"upload",
                  "progress":"start",
                })
              }
            }
            xhr.upload.onloadend = function (e) {
              video.currentTime = 0;
              ignore = false;
              document.querySelector("div#upload > i").innerText = "video";
              document.querySelector("div#upload").style.display = "none";
              document.querySelector("div#upload > progress").value = 0;
              for (participantId in api._participants) {
                api.executeCommand("sendEndpointTextMessage",participantId,{
                  "name":fileupload.file.name,
                  "event":"upload",
                  "progress":"done",
                })
              }
            }
            xhr.onreadystatechange = function() {
              if (this.readyState == 4 && this.status == 200) {
                var data = JSON.parse(this.responseText);
                if (data.status != "ok") return
                fileupload.code = data.data.code;
                fileupload.adminCode = data.data.adminCode;
                src = "https://gofile.io/?c=" + fileupload.code;
                sendState({"type":"newVid"});
              }
            }
            xhr.send(formData);
          });
      }
    }
    input.click();
  }
  document.querySelector("li#open").addEventListener("click", open);
  document.querySelector("li#upload").addEventListener("click", upload);
  document.querySelector("button#open").addEventListener("click", open);
  document.querySelector("button#upload").addEventListener("click", upload);
  document.querySelector("button#play").addEventListener("click", e => {video.paused ? video.play().catch(e => {video.muted = true; video.play()}) : video.pause()});
  document.querySelector("button#speed").addEventListener("click", e => {video.playbackRate = Number(prompt("What playback speed do you want?",video.playbackRate)) || video.playbackRate});
  document.querySelector("button#sync").addEventListener("click", e => {if (Object.keys(api._participants).length > 1) api.executeCommand("sendEndpointTextMessage",Object.keys(api._participants).filter(a => a != api._myUserID)[0],"stateRequest")});
  document.querySelector("button#info").addEventListener("click", e => {alert('This program is powered by the amazing video calling service of Jitsi (https://jitsi.org/) to make it possible to (video)call with eachother, and the awesome filesharing service GoFile.io (https://gofile.io/) to make it possible to upload your own videos to watch together. Please go to their websites and give them some love!')});
  function deleteFile() {
    if (fileupload && fileupload.code && fileupload.server && fileupload.adminCode) {
      fetch('https://' + fileupload.server + '.gofile.io/deleteUpload?c=' + fileupload.code + "&ac=" + fileupload.adminCode + "&removeAll=true")
        .then(response => response.json())
        .then(data => {
          if (data.status != "ok") return;
        })
    }
  }
  function remove() {
    video.src = "";
    document.querySelector("video").style.display = "none";
    src = "";
    deleteFile();
    fileupload = {};
  }
  document.querySelector("button#remove").addEventListener("click", function() {
    remove();
    sendState({"type":"remove"});
  });
  function loadVid() {
    deleteFile();
    if (src) {
      document.querySelector("video").style.display = "";
      var link = new URL(src);
      if (link.hostname == "gofile.io") {
        fileupload = {};
        fileupload.code = link.searchParams.get('c');
        fetch('https://apiv2.gofile.io/getServer?c=' + fileupload.code)
          .then(response => response.json())
          .then(data => {
            if (data.status != "ok") return;
            fileupload.server = data.data.server;
            fetch('https://' + fileupload.server + '.gofile.io/getUpload?c=' + fileupload.code)
              .then(response => response.json())
              .then(data => {
                if (data.status != "ok") return;
                video.src = Object.values(data.data.files)[0].link;
              })
          })
      } else {
        var ext = link.pathname.split("/").slice(-1)[0].split(".").slice(-1)[0]
        if(Hls.isSupported() && ext == "m3u8") {
          var hls = new Hls();
          hls.loadSource(src);
          hls.attachMedia(video);
        } else {
          video.src = src;
        }
      }
    }
  }
  api.addEventListener("readyToClose", function(e){
    document.querySelector("#meet").style.width = 0;
    deleteFile();
  });
  video.addEventListener("play", sendState);
  video.addEventListener("pause", sendState);
  video.addEventListener("seeked", sendState);
  video.addEventListener("waiting", sendState);
  video.addEventListener("playing", sendState);
  video.addEventListener("ratechange", sendState);
  video.addEventListener("canplay", function() {
    if (!ignore && Object.keys(api._participants).length > 1) api.executeCommand("sendEndpointTextMessage",Object.keys(api._participants).filter(a => a != api._myUserID)[0],"stateRequest")
  });
  window.addEventListener("beforeunload", function (e) {
    deleteFile();
  });
});