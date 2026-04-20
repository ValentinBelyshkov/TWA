# backend/utils/slam_publisher.py
"""
Утилиты для запуска и остановки image_publish.py в контейнере TerraSLAM.
"""
import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)


async def start_image_publisher(
    container, 
    frames_dir: str, 
    video_folder_env: Optional[str] = None
) -> bool:
    """
    Запускает кастомный скрипт image_publish.py в контейнере TerraSLAM.
    Соответствует конфигурации supervisor: user=orb, bash -l, source ROS2 && workspace.
    """
    if video_folder_env is None:
        video_folder_env = frames_dir

    # Точная команда из supervisor config
    cmd = (
        f"/bin/bash -l -c '"
        f"source /opt/ros/humble/setup.bash && "
        f"source /home/orb/colcon_ws/install/setup.bash && "
        f"cd /home/orb/Database && "
        f"python3 image_publish.py \"{video_folder_env}\""
        f"'"
    )

    logger.info(f"🎬 Starting image_publisher: {frames_dir}")

    try:
        # ⚠️ ВАЖНО: shell=True в docker-py не поддерживается. Удаляем.
        result = container.exec_run(
            cmd,
            detach=True,
            tty=False,
            user="orb"
        )
        
        # Даём 3 секунды на инициализацию ROS2-ноды
        await asyncio.sleep(3)
        
        # Проверка появления ноды в графе (без shell=True)
        check = container.exec_run("ros2 node list")
        nodes = check.output.decode("utf-8", errors="ignore").lower()
        
        if "image" in nodes:
            logger.info("✅ image_publish.py registered in ROS2 graph")
            return True
        else:
            logger.warning(f"⚠️ image_publish.py launched, but node not detected yet. Exit code: {result.exit_code}")
            return True  # Процесс запущен, продолжаем
            
    except Exception as e:
        logger.error(f"❌ Failed to start image_publisher: {e}")
        return False


def stop_image_publisher(container) -> bool:
    """
    Корректно останавливает процесс image_publish.py в контейнере.
    """
    logger.info("🛑 Stopping image_publisher...")
    try:
        # ⚠️ shell=True удалён. Docker-py сам оборачивает строку в sh -c
        result = container.exec_run("pkill -f 'python3 image_publish.py'")
        output = result.output.decode("utf-8", errors="ignore").strip()
        logger.info(f"✅ image_publisher stopped: {output}")
        return result.exit_code == 0
    except Exception as e:
        logger.error(f"❌ Failed to stop image_publisher: {e}")
        return False
