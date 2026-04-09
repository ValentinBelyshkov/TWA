import asyncio
import json
import os
import base64
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Set

router = APIRouter()

class VideoStreamManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.current_frame: str = ""
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        if self.current_frame:
            await websocket.send_text(json.dumps({"type": "frame", "data": self.current_frame}))
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
    
    async def broadcast(self, frame_data: str):
        self.current_frame = frame_data
        message = json.dumps({"type": "frame", "data": frame_data})
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                pass

video_stream_manager = VideoStreamManager()

ROSBRIDGE_HOST = os.getenv("ROSBRIDGE_HOST", "localhost")
ROSBRIDGE_PORT = int(os.getenv("ROSBRIDGE_PORT", 9090))

async def connect_to_rosbridge():
    """Connect to rosbridge WebSocket and subscribe to /camera/image_raw."""
    while True:
        try:
            ws_url = f"ws://{ROSBRIDGE_HOST}:{ROSBRIDGE_PORT}"
            reader, writer = await asyncio.open_connection(
                ROSBRIDGE_HOST, ROSBRIDGE_PORT
            )
            print(f"Connected to rosbridge at {ws_url}")
            
            subscribe_msg = json.dumps({
                "op": "subscribe",
                "topic": "/camera/image_raw",
                "type": "sensor_msgs/msg/Image"
            })
            writer.write(subscribe_msg.encode() + b'\n')
            await writer.drain()
            
            buffer = b""
            while True:
                data = await reader.read(4096)
                if not data:
                    break
                buffer += data
                
                while b'\n' in buffer:
                    line, buffer = buffer.split(b'\n', 1)
                    try:
                        msg = json.loads(line.decode('utf-8'))
                        if msg.get("topic") == "/camera/image_raw" and "msg" in msg:
                            msg_data = msg["msg"].get("data")
                            if msg_data:
                                await video_stream_manager.broadcast(msg_data)
                    except (json.JSONDecodeError, KeyError):
                        continue
                        
        except Exception as e:
            print(f"Rosbridge connection error: {e}")
            await asyncio.sleep(1)

video_task = None

@router.websocket("/ws/video/{project_id}")
async def video_websocket(websocket: WebSocket, project_id: str):
    """
    WebSocket endpoint for video stream from ROS /camera/image_raw topic via rosbridge.
    """
    global video_task
    
    await video_stream_manager.connect(websocket)
    
    if video_task is None or video_task.done():
        video_task = asyncio.create_task(connect_to_rosbridge())
    
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        video_stream_manager.disconnect(websocket)

@router.post("/start")
async def start_video_stream(project_id: str):
    """Start video stream for a project."""
    return {"status": "started", "project_id": project_id}

@router.post("/stop")
async def stop_video_stream(project_id: str):
    """Stop video stream for a project."""
    return {"status": "stopped", "project_id": project_id}
