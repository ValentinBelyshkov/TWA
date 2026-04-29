# backend/utils/slam_publisher.py
import asyncio
import logging
from typing import Optional, Literal

logger = logging.getLogger(__name__)

async def start_image_publisher(
    container, 
    frames_dir: str, 
    video_folder_env: Optional[str] = None,
    mode: Literal["folder", "realsense"] = "folder"
) -> bool:
    """Запускает image publisher в фоне внутри контейнера TerraSLAM.
    
    Args:
        container: Docker контейнер TerraSLAM
        frames_dir: Путь к папке с фреймами (для режима folder)
        video_folder_env: Переменная окружения VIDEO_FOLDER (для режима folder)
        mode: Режим работы - "folder" (из папки) или "realsense" (live камера)
    """
    loop = asyncio.get_event_loop()
    
    if mode == "realsense":
        # 🔥 Запускаем RealSense через supervisor (как в конфиге)
        cmd = [
            "/bin/bash", "-l", "-c",
            f"source /opt/ros/humble/setup.bash && "
            f"source /home/orb/colcon_ws/install/setup.bash && "
            f"nohup python3 /home/orb/Database/realsense.py "
            f"> /tmp/image_publisher_realsense.log 2>&1 &"
        ]
        logger.info(f"🎬 Starting RealSense publisher (live camera)")
    else:
        # 🔥 Режим папки (симуляция)
        if video_folder_env is None:
            video_folder_env = frames_dir
        
        cmd = [
            "/bin/bash", "-l", "-c",
            f"source /opt/ros/humble/setup.bash && "
            f"nohup python3 /home/orb/Database/image_publish.py '{video_folder_env}' "
            f"> /tmp/image_publisher.log 2>&1 &"
        ]
        logger.info(f"🎬 Starting folder publisher: {frames_dir}")
    
    try:
        # 🔥 Запускаем в отдельном потоке, чтобы не блокировать event loop,
        # потому что docker-py — синхронная библиотека
        exec_result = await loop.run_in_executor(
            None, 
            lambda: container.exec_run(cmd, user="orb")
        )
        
        logger.info(f"🚀 Publisher detached exec exit_code={exec_result.exit_code}")
        
        # Даём 2 секунды на старт
        await asyncio.sleep(2)
        
        # Проверяем, жив ли процесс
        if mode == "realsense":
            check_cmd = "pgrep -f 'python3.*realsense.py'"
            log_file = "/tmp/image_publisher_realsense.log"
        else:
            check_cmd = "pgrep -f 'python3.*image_publish.py'"
            log_file = "/tmp/image_publisher.log"
            
        pgrep_res = await loop.run_in_executor(
            None,
            lambda: container.exec_run(check_cmd, user="orb")
        )
        
        if pgrep_res.exit_code == 0:
            pids = pgrep_res.output.decode("utf-8", errors="ignore").strip()
            logger.info(f"✅ Publisher is running, PID(s): {pids}")
            return True
        else:
            # Смотрим логи, почему упал
            log_res = await loop.run_in_executor(
                None,
                lambda: container.exec_run(f"cat {log_file}", user="orb")
            )
            log_output = log_res.output.decode("utf-8", errors="ignore").strip()
            logger.warning(f"⚠️ Process not found. Logs:\n{log_output[:1000]}")
            return False
            
    except Exception as e:
        logger.error(f"❌ Failed to start publisher: {e}")
        return False

def stop_image_publisher(container, mode: str = "folder") -> bool:
    """Останавливает image publisher и чистит логи.
    
    Args:
        container: Docker контейнер TerraSLAM
        mode: Режим работы - "folder" или "realsense"
    """
    logger.info("🛑 Stopping image_publisher...")
    try:
        if mode == "realsense":
            container.exec_run("pkill -f 'python3 realsense.py'", user="orb")
            container.exec_run("rm -f /tmp/image_publisher_realsense.log", user="orb")
        else:
            container.exec_run("pkill -f 'python3 image_publish.py'", user="orb")
            container.exec_run("rm -f /tmp/image_publisher.log", user="orb")
        logger.info("✅ image_publisher stopped")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to stop image_publisher: {e}")
        return False
