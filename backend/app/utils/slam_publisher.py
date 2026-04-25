# backend/utils/slam_publisher.py
import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

async def start_image_publisher(container, frames_dir: str, video_folder_env: Optional[str] = None) -> bool:
    """Запускает image_publish.py в фоне внутри контейнера TerraSLAM."""
    if video_folder_env is None:
        video_folder_env = frames_dir

    # 🔥 Команда с перенаправлением логов и фоновым запуском через nohup
    # detach=True в exec_run тоже нужен, но nohup + & гарантирует, что процесс 
    # не умрёт при закрытии exec-сессии
    cmd = [
        "/bin/bash", "-l", "-c",
        f"source /opt/ros/humble/setup.bash && "
        f"nohup python3 /home/orb/Database/image_publish.py '{video_folder_env}' "
        f"> /tmp/image_publisher.log 2>&1 &"
    ]

    logger.info(f"🎬 Starting image_publisher: {frames_dir}")
    
    try:
        # 🔥 Запускаем в отдельном потоке, чтобы не блокировать event loop,
        # потому что docker-py — синхронная библиотека
        loop = asyncio.get_event_loop()
        exec_result = await loop.run_in_executor(
            None, 
            lambda: container.exec_run(cmd, user="orb")
        )
        
        logger.info(f"🚀 Publisher detached exec exit_code={exec_result.exit_code}")
        
        # Даём 2 секунды на старт
        await asyncio.sleep(2)
        
        # Проверяем, жив ли процесс
        check_cmd = "pgrep -f 'python3.*image_publish.py'"
        pgrep_res = await loop.run_in_executor(
            None,
            lambda: container.exec_run(check_cmd, user="orb")
        )
        
        if pgrep_res.exit_code == 0:
            pids = pgrep_res.output.decode("utf-8", errors="ignore").strip()
            logger.info(f"✅ image_publish.py is running, PID(s): {pids}")
            return True
        else:
            # Смотрим логи, почему упал
            log_res = await loop.run_in_executor(
                None,
                lambda: container.exec_run("cat /tmp/image_publisher.log", user="orb")
            )
            log_output = log_res.output.decode("utf-8", errors="ignore").strip()
            logger.warning(f"⚠️ Process not found. Logs:\n{log_output[:1000]}")
            return False
            
    except Exception as e:
        logger.error(f"❌ Failed to start image_publisher: {e}")
        return False

def stop_image_publisher(container) -> bool:
    """Останавливает image_publish.py и чистит логи."""
    logger.info("🛑 Stopping image_publisher...")
    try:
        container.exec_run("pkill -f 'python3 image_publish.py'", user="orb")
        container.exec_run("rm -f /tmp/image_publisher.log", user="orb")
        logger.info("✅ image_publisher stopped")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to stop image_publisher: {e}")
        return False
