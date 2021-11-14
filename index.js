const Client = require('./src/Client');

console.log('------------------------------');

var AppController = function () {
    document.getElementById('roomId').value = '1001';
    document.getElementById('userId').value = Math.ceil(Math.random()*100000).toString();

    this.server = document.getElementById('server').value;
    this.roomId = document.getElementById('roomId').value.toString();
    this.userId = document.getElementById('userId').value.toString();
    this.mediaElement = document.getElementById('video_container_publish');

    console.log("server:", this.server, "roomId:", this.roomId, "userId:", this.userId);
    

    this.joinButton       = document.getElementById("join");
    this.publishButton    = document.getElementById("publish");
    this.unpublishButtton = document.getElementById("unpublish");

    this.joinButton.onclick       = this.JoinClicked.bind(this);
    this.publishButton.onclick    = this.PublishClicked.bind(this);
    this.unpublishButtton.onclick = this.UnPublishClicked.bind(this);

};


AppController.prototype.JoinClicked = async function () {
    this.server = document.getElementById('server').value;
    this.roomId = document.getElementById('roomId').value.toString();
    this.userId = document.getElementById('userId').value.toString();

    this._client = new Client();

    var cameraMediaStream = await this._client.OpenCamera();

    this.mediaElement.srcObject = cameraMediaStream;

    this.mediaElement.addEventListener("canplay", () => {
        if (this.mediaElement) {
            console.log("start play the local camera view.");
            this.mediaElement.play();
        }
    });

    var usersInRoom = null;//{"users":[{"uid":"11111"}, {"uid":"22222"}]}
    try
    {
        usersInRoom = await this._client.Join({serverHost: this.server,
                                            roomId: this.roomId,
                                            uid: this.userId});
    }
    catch (error)
    {
        console.log("join error:", error);
        return;
    }

    this._client.on('unpublish', async(data) => {
        var remoteUid = data.uid;
        var publishersInfo = data.publishers;

        try {
            this._client.UnSubscribe(remoteUid, publishersInfo);
        } catch (error) {
            console.log("UnSubscribe error:", error);
            throw error;
        }
        var elementId = 'userContainer_' + remoteUid;
        var userContainer = document.getElementById(elementId);
        var remoteContainerElement = document.getElementById('remoteContainer');

        if (userContainer == null)
        {
            console.log("fail to get element by id:", elementId);
            return;
        }

        remoteContainerElement.removeChild(userContainer);
    });

    this._client.on('publish', async (data) => {
        try {
            var remoteUid  = data['uid'];
            var remotePcId = data['pcid'];

            var newMediaStream = await this._client.Subscribe(remoteUid, remotePcId, data['publishers']);
            
            var userContainer = document.createElement("div");
            userContainer.id = 'userContainer_' + remoteUid;

            var userLabel = document.createElement("label");
            userLabel.id = 'userLabel_' + remoteUid;
            userLabel.innerHTML = 'remote user: ' + remoteUid;
            userContainer.appendChild(userLabel);
    
            var mediaContainer = document.createElement("div");
            mediaContainer.id = 'mediaContainer_' + remoteUid;
            userContainer.appendChild(mediaContainer);
    
            var videoElement = document.createElement("video");
            videoElement.id = 'videoElement_' + remoteUid;
            videoElement.srcObject    = newMediaStream;
            videoElement.style.width  = 320;
            videoElement.style.height = 240;
            mediaContainer.appendChild(videoElement);
    
            var remoteContainerElement = document.getElementById('remoteContainer');
            remoteContainerElement.appendChild(userContainer);
    
            videoElement.addEventListener("canplay", () => {
                console.log("remote user:", remoteUid, "canplay....");
                videoElement.play();
            });
        } catch (error) {
            console.log("subscribe error:", error);
            return;
        }
    });

    //join: {serverHost: this.server, roomId: this.roomId, uid: this.userId}
}

AppController.prototype.PublishClicked = async function () {
    await this._client.PublishCamera({videoEnable: true, audioEnable: true});
}

AppController.prototype.UnPublishClicked = async function () {
    await this._client.UnPublishCamera({videoDisable: true, audioDisable: true});
}

var appConntrol = new AppController();