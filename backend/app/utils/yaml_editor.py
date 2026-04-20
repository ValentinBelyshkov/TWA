# utils/yaml_editor.py
import re
import os
import tempfile
import shutil

def update_slam_yaml(
    yaml_path: str,
    save_filename: str,
    comment_load: bool = True
) -> bool:
    """
    Обновляет real.yaml для ORB-SLAM3:
    - Комментирует все System.LoadAtlasFromFile
    - Устанавливает System.SaveAtlasToFile в новое значение
    
    Args:
        yaml_path: Полный путь к файлу (внутри контейнера бэкенда)
        save_filename: Новое имя для сохранения (без .osa, например "Map/test-run-001")
        comment_load: Если True — комментирует Load-строки
    
    Returns:
        bool: True если успешно
    """
    if not os.path.exists(yaml_path):
        print(f"❌ YAML file not found: {yaml_path}")
        return False
    
    try:
        with open(yaml_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        
        # 1. Комментируем System.LoadAtlasFromFile (все вариации)
        if comment_load:
            # Паттерн: строка начинается с (возможно) пробелов, затем #?System.LoadAtlasFromFile
            content = re.sub(
                r'^(\s*)(#?\s*System\.LoadAtlasFromFile\s*:.*)$',
                r'\1# \2',  # добавляем # в начало, сохраняем отступ
                content,
                flags=re.MULTILINE
            )
        
        # 2. Обновляем System.SaveAtlasToFile
        # Ищем активную (не закомментированную) строку и заменяем значение
        def replace_save(match):
            indent = match.group(1)
            return f'{indent}System.SaveAtlasToFile: "{save_filename}"'
        
        content = re.sub(
            r'^(\s*)(System\.SaveAtlasToFile\s*:\s*)"[^"]*"$',
            replace_save,
            content,
            flags=re.MULTILINE
        )
        
        # Если ни одной активной Save-строки не найдено — добавляем в конец секции System config
        if content == original_content and save_filename:
            # Находим конец секции System config и добавляем туда
            system_section_end = re.search(
                r'^#+\s*-+$\s*^#+\s*Camera Parameters',
                content,
                flags=re.MULTILINE
            )
            if system_section_end:
                insert_pos = system_section_end.start()
                new_line = f'\nSystem.SaveAtlasToFile: "{save_filename}"\n'
                content = content[:insert_pos] + new_line + content[insert_pos:]
        
        # 3. Атомарная запись (защита от обрыва записи)
        dir_name = os.path.dirname(yaml_path)
        with tempfile.NamedTemporaryFile(
            mode='w', 
            dir=dir_name, 
            delete=False, 
            suffix='.tmp',
            encoding='utf-8'
        ) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        
        shutil.move(tmp_path, yaml_path)
        os.chmod(yaml_path, 0o666)
        print(f"✅ Updated YAML: {yaml_path}")
        print(f"   → SaveAtlasToFile: \"{save_filename}\"")
        if comment_load:
            print("   → LoadAtlasFromFile: commented out")
        return True
        
    except Exception as e:
        print(f"❌ YAML update failed: {e}")
        # Чистим временный файл если остался
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.remove(tmp_path)
        return False
