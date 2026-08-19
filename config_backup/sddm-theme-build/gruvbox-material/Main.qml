import QtQuick 2.15

Rectangle {
    id: root
    width: 1920
    height: 1080
    color: config.colorBg

    // ---- palette (from theme.conf) ----
    readonly property color cBg:     config.colorBg
    readonly property color cCard:   config.colorCard
    readonly property color cField:  config.colorField
    readonly property color cFg:     config.colorFg
    readonly property color cDim:    config.colorDim
    readonly property color cBorder: config.colorBorder
    readonly property color cAccent: config.colorAccent
    readonly property color cAmber:  config.colorAmber
    readonly property color cRed:    config.colorRed
    readonly property color cGreen:  config.colorGreen

    property int sessionIndex: sessionModel.lastIndex
    property var sessionNames: []
    property string sessionName: ""

    FontLoader { id: hack;     source: "fonts/HackNerdFont-Regular.ttf" }
    FontLoader { id: hackBold; source: "fonts/HackNerdFont-Bold.ttf" }

    // collect session names so we can display the current one
    Repeater {
        model: sessionModel
        Item {
            Component.onCompleted: {
                var a = root.sessionNames.slice()
                a[index] = name
                root.sessionNames = a
                if (index === root.sessionIndex)
                    root.sessionName = name
            }
        }
    }

    function doLogin() {
        sddm.login(userField.text, passField.text, root.sessionIndex)
    }

    Connections {
        target: sddm
        function onLoginSucceeded() {
            errorText.color = root.cGreen
            errorText.text = "Welcome"
        }
        function onLoginFailed() {
            passField.text = ""
            passField.forceActiveFocus()
            errorText.color = root.cRed
            errorText.text = "Login failed \u2014 try again"
        }
        function onInformationMessage(message) {
            errorText.color = root.cAmber
            errorText.text = message
        }
    }

    // ---- background ----
    Image {
        id: bg
        anchors.fill: parent
        source: config.background
        fillMode: Image.PreserveAspectCrop
        smooth: true
        asynchronous: true
    }

    // warm legibility overlay
    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0.0; color: Qt.rgba(0.10, 0.07, 0.05, 0.35) }
            GradientStop { position: 0.6; color: Qt.rgba(0.10, 0.07, 0.05, 0.45) }
            GradientStop { position: 1.0; color: Qt.rgba(0.08, 0.05, 0.03, 0.75) }
        }
    }

    // ---- clock ----
    Column {
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.top: parent.top
        anchors.topMargin: root.height * 0.12
        spacing: 2
        Text {
            id: timeText
            anchors.horizontalCenter: parent.horizontalCenter
            font.family: hackBold.name
            font.pixelSize: 78
            color: "#ffffff"
            style: Text.Raised
            styleColor: Qt.rgba(0, 0, 0, 0.5)
        }
        Text {
            id: dateText
            anchors.horizontalCenter: parent.horizontalCenter
            font.family: hack.name
            font.pixelSize: 22
            color: root.cAmber
        }
    }

    function tick() {
        var d = new Date()
        timeText.text = Qt.formatTime(d, "HH:mm")
        dateText.text = Qt.formatDate(d, "dddd, MMMM d")
    }
    Timer { interval: 1000; running: true; repeat: true; onTriggered: root.tick() }
    Component.onCompleted: {
        root.tick()
        if (userField.text === "")
            userField.forceActiveFocus()
        else
            passField.forceActiveFocus()
    }

    // ---- login card ----
    Rectangle {
        id: card
        anchors.centerIn: parent
        width: 420
        height: cardCol.implicitHeight + 56
        radius: 18
        color: Qt.rgba(root.cCard.r, root.cCard.g, root.cCard.b, 0.92)
        border.color: root.cAccent
        border.width: 2

        Column {
            id: cardCol
            anchors.centerIn: parent
            width: parent.width - 56
            spacing: 18

            Text {
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                text: (userModel.lastUser && userModel.lastUser.length > 0)
                      ? ("Welcome back, " + userModel.lastUser)
                      : "Welcome"
                elide: Text.ElideRight
                color: root.cFg
                font.family: hackBold.name
                font.pixelSize: 20
            }

            // username field
            Rectangle {
                width: parent.width
                height: 46
                radius: 10
                color: root.cField
                border.width: 1
                border.color: userField.activeFocus ? root.cAmber : root.cBorder
                Row {
                    anchors.fill: parent
                    anchors.leftMargin: 14
                    anchors.rightMargin: 14
                    spacing: 10
                    Text {
                        anchors.verticalCenter: parent.verticalCenter
                        text: "\uf007"   // nf user glyph
                        font.family: hack.name
                        font.pixelSize: 18
                        color: root.cAccent
                    }
                    TextInput {
                        id: userField
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width - 34
                        text: userModel.lastUser
                        color: root.cFg
                        font.family: hack.name
                        font.pixelSize: 17
                        clip: true
                        selectionColor: root.cAccent
                        selectedTextColor: root.cBg
                        onAccepted: passField.forceActiveFocus()
                        KeyNavigation.tab: passField
                    }
                }
            }

            // password field
            Rectangle {
                width: parent.width
                height: 46
                radius: 10
                color: root.cField
                border.width: 1
                border.color: passField.activeFocus ? root.cAmber : root.cBorder
                Row {
                    anchors.fill: parent
                    anchors.leftMargin: 14
                    anchors.rightMargin: 14
                    spacing: 10
                    Text {
                        anchors.verticalCenter: parent.verticalCenter
                        text: "\uf023"   // nf lock glyph
                        font.family: hack.name
                        font.pixelSize: 18
                        color: root.cAccent
                    }
                    TextInput {
                        id: passField
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width - 34
                        echoMode: TextInput.Password
                        passwordCharacter: "\u25cf"
                        color: root.cFg
                        font.family: hack.name
                        font.pixelSize: 17
                        clip: true
                        selectionColor: root.cAccent
                        selectedTextColor: root.cBg
                        onAccepted: root.doLogin()
                    }
                }
            }

            // login button
            Rectangle {
                id: loginBtn
                width: parent.width
                height: 46
                radius: 10
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0.0; color: root.cAccent }
                    GradientStop { position: 1.0; color: root.cAmber }
                }
                opacity: loginMouse.pressed ? 0.8 : 1.0
                Text {
                    anchors.centerIn: parent
                    text: "\uf2f6   Log In"
                    color: root.cBg
                    font.family: hackBold.name
                    font.pixelSize: 17
                }
                MouseArea {
                    id: loginMouse
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.doLogin()
                }
            }

            Text {
                id: errorText
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                text: ""
                color: root.cRed
                font.family: hack.name
                font.pixelSize: 14
                wrapMode: Text.WordWrap
            }
        }
    }

    // ---- bottom bar: session selector + power ----
    Item {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: 64

        // session selector
        Rectangle {
            id: sessionBtn
            anchors.left: parent.left
            anchors.leftMargin: 24
            anchors.verticalCenter: parent.verticalCenter
            width: sessionRow.implicitWidth + 28
            height: 40
            radius: 10
            color: Qt.rgba(root.cBg.r, root.cBg.g, root.cBg.b, 0.85)
            border.color: root.cBorder
            border.width: 1
            Row {
                id: sessionRow
                anchors.centerIn: parent
                spacing: 8
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: "\uf17c"  // nf desktop glyph
                    font.family: hack.name
                    font.pixelSize: 16
                    color: root.cAccent
                }
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: root.sessionName === "" ? "Session" : root.sessionName
                    font.family: hack.name
                    font.pixelSize: 15
                    color: root.cFg
                }
            }
            MouseArea {
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                onClicked: sessionPopup.visible = !sessionPopup.visible
            }
        }

        // session popup list
        Rectangle {
            id: sessionPopup
            visible: false
            anchors.left: sessionBtn.left
            anchors.bottom: sessionBtn.top
            anchors.bottomMargin: 8
            width: sessionBtn.width
            height: Math.min(sessionList.contentHeight + 12, 260)
            radius: 10
            color: Qt.rgba(root.cCard.r, root.cCard.g, root.cCard.b, 0.98)
            border.color: root.cAccent
            border.width: 1
            ListView {
                id: sessionList
                anchors.fill: parent
                anchors.margins: 6
                clip: true
                model: sessionModel
                delegate: Rectangle {
                    width: sessionList.width
                    height: 34
                    radius: 8
                    color: (index === root.sessionIndex) ? root.cField : "transparent"
                    Text {
                        anchors.verticalCenter: parent.verticalCenter
                        anchors.left: parent.left
                        anchors.leftMargin: 10
                        text: name
                        color: (index === root.sessionIndex) ? root.cAmber : root.cFg
                        font.family: hack.name
                        font.pixelSize: 15
                    }
                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            root.sessionIndex = index
                            root.sessionName = name
                            sessionPopup.visible = false
                        }
                    }
                }
            }
        }

        // power buttons
        Row {
            anchors.right: parent.right
            anchors.rightMargin: 24
            anchors.verticalCenter: parent.verticalCenter
            spacing: 10

            Repeater {
                model: [
                    { glyph: "\uf023", act: "hibernate", show: sddm.canHibernate, col: root.cDim },
                    { glyph: "\uf186", act: "suspend",   show: sddm.canSuspend,   col: root.cAmber },
                    { glyph: "\uf021", act: "reboot",    show: sddm.canReboot,    col: root.cGreen },
                    { glyph: "\uf011", act: "poweroff",  show: sddm.canPowerOff,  col: root.cRed }
                ]
                delegate: Rectangle {
                    visible: modelData.show
                    width: 40
                    height: 40
                    radius: 20
                    color: Qt.rgba(root.cBg.r, root.cBg.g, root.cBg.b, powerMouse.containsMouse ? 0.95 : 0.85)
                    border.color: powerMouse.containsMouse ? modelData.col : root.cBorder
                    border.width: 1
                    Text {
                        anchors.centerIn: parent
                        text: modelData.glyph
                        font.family: hack.name
                        font.pixelSize: 18
                        color: modelData.col
                    }
                    MouseArea {
                        id: powerMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            if (modelData.act === "poweroff")  sddm.powerOff()
                            else if (modelData.act === "reboot")    sddm.reboot()
                            else if (modelData.act === "suspend")   sddm.suspend()
                            else if (modelData.act === "hibernate") sddm.hibernate()
                        }
                    }
                }
            }
        }
    }
}
