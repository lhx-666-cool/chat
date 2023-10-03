'use strict';

// join 主动加入房间
// leave 主动离开房间
// new-peer 有人加入房间，通知已经在房间的人
// peer-leave 有人离开房间，通知已经在房间的人
// offer 发送offer给对端peer
// answer发送offer给对端peer
// candidate 发送candidate给对端peer
const SIGNAL_TYPE_JOIN = "join";
const SIGNAL_TYPE_RESP_JOIN = "resp-join";  // 告知加入者对方是谁
const SIGNAL_TYPE_LEAVE = "leave";
const SIGNAL_TYPE_NEW_PEER = "new-peer";
const SIGNAL_TYPE_PEER_LEAVE = "peer-leave";
const SIGNAL_TYPE_OFFER = "offer";
const SIGNAL_TYPE_ANSWER = "answer";
const SIGNAL_TYPE_CANDIDATE = "candidate";
const BYTES_PRE_CHUNK = 262144;

var localUserId = Math.random().toString(36).substr(2); // 本地uid
var remoteUserId = -1;      // 对端
var roomId = 0;

var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');
var localStream = null;
var remoteStream = null;
var pc = null;

var zeroRTCEngine;
var sendChannel;

var file;
var currentChunk;
var fileReader = new FileReader();
var incomingFileInfo;
var incomingFileData;
var bytesReceived;
var downloadInProgress = false;
var element = layui.element;
var filedisplay = document.querySelector(".filedisplay");
var filedes = document.querySelector(".filedes");
var layer = layui.layer;
var loading;
function handleIceCandidate(event) {
    console.info("handleIceCandidate");
    if (event.candidate) {
        var candidateJson = {
            'label': event.candidate.sdpMLineIndex,
            'id': event.candidate.sdpMid,
            'candidate': event.candidate.candidate
        };
        var jsonMsg = {
            'cmd': SIGNAL_TYPE_CANDIDATE,
            'roomId': roomId,
            'uid': localUserId,
            'remoteUid':remoteUserId,
            'msg': JSON.stringify(candidateJson) 
        };
        var message = JSON.stringify(jsonMsg);
        zeroRTCEngine.sendMessage(message);
        console.info("handleIceCandidate message: " + message);
        console.info("send candidate message");
    } else {
        console.warn("End of candidates");
    }
}


function handleConnectionStateChange() {
    if(pc != null) {
        console.info("ConnectionState -> " + pc.connectionState);
    }
}

function handleIceConnectionStateChange() {
    if(pc != null) {
        console.info("IceConnectionState -> " + pc.iceConnectionState);
    }
}

function sleep(d){
    for (var i = 0; i < d; i++) {
        Math.sqrt(i) * Math.pow(i, i);
    }
}


function createPeerConnection() {


    pc = new RTCPeerConnection();
    pc.onicecandidate = handleIceCandidate;
    pc.onconnectionstatechange = handleConnectionStateChange;
    pc.oniceconnectionstatechange = handleIceConnectionStateChange
    sendChannel = pc.createDataChannel('sendChannel');
    pc.ondatachannel = function (event) {
        // alert("加入成功")
        layer.msg("加入成功");
        layer.close(loading);
        var receiveChannel = event.channel;
        console.log('ok');
        receiveChannel.onmessage = function (e) {
            console.log("e", e.data);
            if (downloadInProgress === true) {
                progressDownload(e.data);
            }else {
                console.log("e.data", typeof(e.data));
                e = JSON.parse(e.data);
                console.log(e);
                if (e.type === 'text') {
                    console.log(e.msg);
                    chataddremote(e.msg);
                }else if (e.type === 'file' && downloadInProgress === false) {
                    startDownload(e);
                }
            }
        }
    }
    document.getElementById('sendbtn').onclick = function () {
        var msg = document.getElementById('sendtext').value;
        document.getElementById('sendtext').value = "";
        var sendmsg = {type: 'text', msg: msg};
        sendChannel.send(JSON.stringify(sendmsg));
        chataddlocal(msg);
    }
    var fileinp = document.querySelector("#fileinp");
    document.getElementById("morebtn").onclick = function() {
        fileinp.click();
    }

    document.getElementById("fileinp").onchange = function () {
        file = fileinp.files[0];
        console.log(file);
        currentChunk = 0;
        sendChannel.send(JSON.stringify({
            type: 'file',
            name: file.name,
            size: file.size,
        }));
        readNextChunk();
        filedisplay.style.display = 'block';
        element.progress('filepro', '0%');
        filedes.innerText = "文件" + file.name + "正在发送";
    }
}

function readNextChunk() {
    var start = BYTES_PRE_CHUNK * currentChunk;
    var end = Math.min(file.size, start + BYTES_PRE_CHUNK);
    fileReader.readAsArrayBuffer(file.slice(start, end));
}

var speed = 30;
var cnt = 0;
fileReader.onload = function () {
    cnt++;
    if (cnt >= 100) {
        cnt = 0;
        speed = 30;
    }
    console.log({
        type: 'file',
        data: fileReader.result,
        res: 1
    });
    try {
        sendChannel.send(fileReader.result);
        currentChunk ++;
    } catch (err) {
        console.log(err);
        speed += 20;
    }
    if (BYTES_PRE_CHUNK * currentChunk < file.size) {
        setTimeout(readNextChunk, speed);
        var fileprogress = BYTES_PRE_CHUNK * currentChunk / file.size;
        element.progress('filepro', fileprogress * 100 + '%');
    }else {
        filedisplay.style.display = 'none';
    }
}

function startDownload(data) {

    incomingFileInfo = {
        fileName: data.name,
        fileSize: data.size,
    }
    filedisplay.style.display = 'block';
    element.progress('filepro', '0%');
    filedes.innerText = '文件' + data.name + '正在下载';
    incomingFileData = [];
    bytesReceived = 0;
    downloadInProgress = true;
    console.log("info", incomingFileInfo);
}

var testdata;
function progressDownload(data) {
    testdata = data;
    console.log(bytesReceived);
    if (data.size != undefined) {
        bytesReceived += data.size;
    }else {
        bytesReceived += data.byteLength;
    }
    element.progress('filepro', bytesReceived / incomingFileInfo.fileSize * 100 + '%');
    incomingFileData.push(data);
    console.log(bytesReceived);
    if (bytesReceived === incomingFileInfo.fileSize) {
        endDownload();
    }
}
function endDownload() {
    filedisplay.style.display = 'none';
    console.log("incoming", incomingFileData);
    downloadInProgress = false;
    var blob = new window.Blob(incomingFileData);
    var anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = incomingFileInfo.fileName;
    anchor.textContent = 'xxx';
    anchor.click();
}

function createOfferAndSendMessage(session) {
    pc.setLocalDescription(session)
        .then(function () {
            var jsonMsg = {
                'cmd': 'offer',
                'roomId': roomId,
                'uid': localUserId,
                'remoteUid': remoteUserId,
                'msg': JSON.stringify(session)
            };
            var message = JSON.stringify(jsonMsg);
            zeroRTCEngine.sendMessage(message);
            console.info("send offer message");
        })
        .catch(function (error) {
            console.error("offer setLocalDescription failed: " + error);
        });

}

function handleCreateOfferError(error) {
    console.error("handleCreateOfferError: " + error);
}

function createAnswerAndSendMessage(session) {
    pc.setLocalDescription(session)
        .then(function () {
            var jsonMsg = {
                'cmd': 'answer',
                'roomId': roomId,
                'uid': localUserId,
                'remoteUid': remoteUserId,
                'msg': JSON.stringify(session)
            };
            var message = JSON.stringify(jsonMsg);
            zeroRTCEngine.sendMessage(message);
            console.info("send answer message");
        })
        .catch(function (error) {
            console.error("answer setLocalDescription failed: " + error);
        });

}

function handleCreateAnswerError(error) {
    console.error("handleCreateAnswerError: " + error);
}



var ZeroRTCEngine = function (wsUrl) {
    this.init(wsUrl);
    zeroRTCEngine = this;
    return this;
}

ZeroRTCEngine.prototype.init = function (wsUrl) {
    this.wsUrl = wsUrl;
    this.signaling = null;
}

ZeroRTCEngine.prototype.createWebsocket = function () {
    zeroRTCEngine = this;
    zeroRTCEngine.signaling = new WebSocket(this.wsUrl);

    zeroRTCEngine.signaling.onopen = function () {
        zeroRTCEngine.onOpen();
    }

    zeroRTCEngine.signaling.onmessage = function (ev) {
        zeroRTCEngine.onMessage(ev);
    }

    zeroRTCEngine.signaling.onerror = function (ev) {
        zeroRTCEngine.onError(ev);
    }

    zeroRTCEngine.signaling.onclose = function (ev) {
        zeroRTCEngine.onClose(ev);
    }
}

ZeroRTCEngine.prototype.onOpen = function () {
    console.log("websocket open");
}
ZeroRTCEngine.prototype.onMessage = function (event) {
    console.log("onMessage: " + event.data);
    var jsonMsg = null;
    try {
         jsonMsg = JSON.parse(event.data);
    } catch(e) {
        console.warn("onMessage parse Json failed:" + e);
        return;
    }

    switch (jsonMsg.cmd) {
        case SIGNAL_TYPE_NEW_PEER:
            handleRemoteNewPeer(jsonMsg);
            break;
        case SIGNAL_TYPE_RESP_JOIN:
            handleResponseJoin(jsonMsg);
            break;
        case SIGNAL_TYPE_PEER_LEAVE:
            handleRemotePeerLeave(jsonMsg);
            break;
        case SIGNAL_TYPE_OFFER:
            handleRemoteOffer(jsonMsg);
            break;
        case SIGNAL_TYPE_ANSWER:
            handleRemoteAnswer(jsonMsg);
            break;
        case SIGNAL_TYPE_CANDIDATE:
            handleRemoteCandidate(jsonMsg);
            break;
    }
}

ZeroRTCEngine.prototype.onError = function (event) {
    console.log("onError: " + event.data);
}

ZeroRTCEngine.prototype.onClose = function (event) {
    console.log("onClose -> code: " + event.code + ", reason:" + EventTarget.reason);
}

ZeroRTCEngine.prototype.sendMessage = function (message) {
    this.signaling.send(message);
}

function handleResponseJoin(message) {
    console.info("handleResponseJoin, remoteUid: " + message.remoteUid);
    remoteUserId = message.remoteUid;
    // doOffer();
}

function handleRemotePeerLeave(message) {
    console.info("handleRemotePeerLeave, remoteUid: " + message.remoteUid);
    remoteVideo.srcObject = null;
    if(pc != null) {
        pc.close();
        pc = null;
    }
}

function handleRemoteNewPeer(message) {
    console.info("handleRemoteNewPeer, remoteUid: " + message.remoteUid);
    remoteUserId = message.remoteUid;
    doOffer();
}

function handleRemoteOffer(message) {
    console.info("handleRemoteOffer");
    if(pc == null) {
        createPeerConnection();
    }
    var desc = JSON.parse(message.msg);
    pc.setRemoteDescription(desc);
    doAnswer();
}

function handleRemoteAnswer(message) {
    console.info("handleRemoteAnswer");
    var desc = JSON.parse(message.msg);
    pc.setRemoteDescription(desc);
}

function handleRemoteCandidate(message) {
    console.info("handleRemoteCandidate");
    var jsonMsg = JSON.parse(message.msg);
    var candidateMsg = {
        'sdpMLineIndex': jsonMsg.label,
        'sdpMid': jsonMsg.id,
        'candidate': jsonMsg.candidate
    };
    var candidate = new RTCIceCandidate(candidateMsg);
    pc.addIceCandidate(candidate).catch(e => {
        console.error("addIceCandidate failed:" + e.name);
    });
}

function doOffer() {
    // 创建RTCPeerConnection
    if (pc == null) {
        createPeerConnection();
    }
    pc.createOffer().then(createOfferAndSendMessage).catch(handleCreateOfferError);
}

function doAnswer() {
    pc.createAnswer().then(createAnswerAndSendMessage).catch(handleCreateAnswerError);
}


function doJoin(roomId) {
    var jsonMsg = {
        'cmd': 'join',
        'roomId': roomId,
        'uid': localUserId,
    };
    var message = JSON.stringify(jsonMsg);
    zeroRTCEngine.sendMessage(message);
    console.info("doJoin message: " + message);
}

function doLeave() {
    var jsonMsg = {
        'cmd': 'leave',
        'roomId': roomId,
        'uid': localUserId,
    };
    var message = JSON.stringify(jsonMsg);
    zeroRTCEngine.sendMessage(message);
    console.info("doLeave message: " + message);
    hangup();
    location.reload();
}

function hangup() {
    if(pc != null) {
        pc.close();
        pc = null;
    }
}

zeroRTCEngine = new ZeroRTCEngine("ws://39.99.137.136:8080/");
zeroRTCEngine.createWebsocket();

document.getElementById('joinBtn').onclick = function () {
    roomId = document.getElementById('zero-roomId').value;
    if (roomId == "" || roomId == "请输入房间ID") {
        alert("请输入房间ID");
        return;
    }
    $(".tips").css("display", 'none');
    loading = layer.msg('正在等待连接，长时间未成功请刷新网页', {
        icon: 16,
        shade: 0.7,
        time: 0,
    })
    console.log("加入按钮被点击, roomId: " + roomId);
    // 初始化本地码流
    // initLocalStream();
    doJoin(roomId);
}

document.getElementById('leaveBtn').onclick = function () {
    console.log("离开按钮被点击");
    doLeave();
}
var chatbox = document.querySelector(".chatbox");
var localmsg  = document.querySelectorAll(".local");
function reaction() {
    var localmsg  = document.querySelectorAll(".local");
    chatbox.style.height = window.innerHeight - 320 + 'px';
    localmsg.forEach((e) => {
        var ce = window.getComputedStyle(e);
        e.style.translate = window.innerWidth - parseInt(ce.width) - 80 + 'px';
    })
}
reaction();
window.addEventListener('resize', () => {
    reaction();
})

function chataddlocal(msg) {
    console.log(chatbox.innerHTML);
    var div = document.createElement("pre");
    div.className = 'local msg'
    div.innerText = msg;
    chatbox.appendChild(div);
    scoll(div);
    div = document.createElement('br');
    chatbox.appendChild(div);
    reaction();
}
function chataddremote(msg) {
    console.log(chatbox.innerHTML);
    var div = document.createElement("pre");
    div.className = 'remote msg'
    div.innerText = msg;
    chatbox.appendChild(div);
    scoll(div);
    div = document.createElement('br');
    chatbox.appendChild(div);
}

function scoll(div) {
    var height = window.getComputedStyle(div)
    console.log(height)
    height = height.height;
    console.log(parseInt(height));
    chatbox.scroll(0, 1e9);
}

$.ajax({
    url: 'https://www.mxnzp.com/api/ip/self',
    method: 'get',
    dataType: 'json',
    data: {
        app_id: 'skrpjfqalfm8mukx',
        app_secret: 'ufdorV2xzuBHsvbgJv4QX97mSXWiBo6V',
    },
    success: function(msg) {
        document.querySelector(".ip").innerText = msg.data.ip;
    }
})

var random = Math.random().toString(36).substring(3, 7);
$("#zero-roomId")[0].value = random;
