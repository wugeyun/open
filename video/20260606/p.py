from pathlib import Path

# 获取当前目录下所有图片（支持常见格式，不区分大小写）
image_files = list(Path(".").glob("*.[jJ][pP][gG]")) + \
              list(Path(".").glob("*.[jJ][pP][eE][gG]")) + \
              list(Path(".").glob("*.[pP][nN][gG]")) + \
              list(Path(".").glob("*.[gG][iI][fF]")) + \
              list(Path(".").glob("*.[wW][eE][bB][pP]"))

# 按文件名排序（可选：按时间排序用 `key=lambda x: x.stat().st_mtime`）
image_files.sort()

# 重命名为 1.jpg, 2.png, 3.gif ...
for idx, old_path in enumerate(image_files, start=1):
    new_name = f"{idx}{old_path.suffix.lower()}"  # 统一小写后缀
    old_path.rename(new_name)
    print(f"Renamed: {old_path.name} -> {new_name}")