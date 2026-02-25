from PIL import Image, ImageDraw
import os
import sys

# ============================================
# 고정 디자인 값 (parent-app)
# ============================================
# 배경색 (흰색)
BACKGROUND_COLOR = (255, 255, 255)  # #ffffff

# 로고 최대 크기 비율
LOGO_MAX_WIDTH_RATIO = 0.80
LOGO_MAX_HEIGHT_RATIO = 0.80

# ============================================
# 경로 설정
# ============================================
base_path = os.path.dirname(os.path.abspath(__file__))
logo_path = os.path.normpath(os.path.join(base_path, "..", "..", "assets", "Logo_parent.png"))
res_path = os.path.join(base_path, "android", "app", "src", "main", "res")

# 아이콘 크기 설정
icon_sizes = {
    "mipmap-mdpi": {"launcher": 48, "foreground": 108},
    "mipmap-hdpi": {"launcher": 72, "foreground": 162},
    "mipmap-xhdpi": {"launcher": 96, "foreground": 216},
    "mipmap-xxhdpi": {"launcher": 144, "foreground": 324},
    "mipmap-xxxhdpi": {"launcher": 192, "foreground": 432},
}


def create_simple_icon(logo_img, size):
    """
    로고만 있는 심플한 아이콘 생성 (흰색 배경)
    """
    # 흰색 배경 생성
    icon = Image.new('RGBA', (size, size), BACKGROUND_COLOR + (255,))

    # 로고 크기 계산 (비율 유지)
    logo_max_width = int(size * LOGO_MAX_WIDTH_RATIO)
    logo_max_height = int(size * LOGO_MAX_HEIGHT_RATIO)

    # 로고 리사이즈 (최고 품질)
    logo_resized = logo_img.copy()
    logo_resized.thumbnail((logo_max_width, logo_max_height), Image.Resampling.LANCZOS)

    # 로고 중앙 위치 계산
    logo_x = (size - logo_resized.width) // 2
    logo_y = (size - logo_resized.height) // 2

    # 로고 붙여넣기 (알파 채널 유지)
    if logo_resized.mode == 'RGBA':
        icon.paste(logo_resized, (logo_x, logo_y), logo_resized)
    else:
        icon.paste(logo_resized, (logo_x, logo_y))

    return icon


def create_round_icon(logo_img, size):
    """원형 아이콘 생성"""
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse([0, 0, size, size], fill=255)

    # 흰색 배경 원형
    round_icon = Image.new('RGBA', (size, size), BACKGROUND_COLOR + (255,))

    # 로고 추가
    logo_max_width = int(size * LOGO_MAX_WIDTH_RATIO)
    logo_max_height = int(size * LOGO_MAX_HEIGHT_RATIO)
    logo_resized = logo_img.copy()
    logo_resized.thumbnail((logo_max_width, logo_max_height), Image.Resampling.LANCZOS)

    logo_x = (size - logo_resized.width) // 2
    logo_y = (size - logo_resized.height) // 2

    if logo_resized.mode == 'RGBA':
        round_icon.paste(logo_resized, (logo_x, logo_y), logo_resized)
    else:
        round_icon.paste(logo_resized, (logo_x, logo_y))

    # 원형 마스크 적용
    output = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    output.paste(round_icon, (0, 0), mask)

    return output


def main():
    print(f"로고 경로: {logo_path}")

    if not os.path.exists(logo_path):
        print(f"오류: 로고 파일을 찾을 수 없습니다: {logo_path}")
        sys.exit(1)

    logo = Image.open(logo_path).convert('RGBA')
    print(f"로고 로드 완료: {logo.size[0]}x{logo.size[1]}")

    for folder, sizes in icon_sizes.items():
        folder_path = os.path.join(res_path, folder)
        os.makedirs(folder_path, exist_ok=True)

        # ic_launcher.png 생성
        launcher_size = sizes["launcher"]
        launcher_icon = create_simple_icon(logo, launcher_size)
        launcher_path = os.path.join(folder_path, "ic_launcher.png")
        launcher_icon.save(launcher_path, "PNG")
        print(f"생성 완료: {launcher_path}")

        # ic_launcher_round.png 생성
        round_icon = create_round_icon(logo, launcher_size)
        round_path = os.path.join(folder_path, "ic_launcher_round.png")
        round_icon.save(round_path, "PNG")
        print(f"생성 완료: {round_path}")

        # ic_launcher_foreground.png 생성 (투명 배경)
        foreground_size = sizes["foreground"]

        # foreground는 투명 배경 + 로고만
        icon = Image.new('RGBA', (foreground_size, foreground_size), (0, 0, 0, 0))
        logo_max_width = int(foreground_size * LOGO_MAX_WIDTH_RATIO)
        logo_max_height = int(foreground_size * LOGO_MAX_HEIGHT_RATIO)
        logo_resized = logo.copy()
        logo_resized.thumbnail((logo_max_width, logo_max_height), Image.Resampling.LANCZOS)
        logo_x = (foreground_size - logo_resized.width) // 2
        logo_y = (foreground_size - logo_resized.height) // 2

        if logo_resized.mode == 'RGBA':
            icon.paste(logo_resized, (logo_x, logo_y), logo_resized)
        else:
            icon.paste(logo_resized, (logo_x, logo_y))

        foreground_path = os.path.join(folder_path, "ic_launcher_foreground.png")
        icon.save(foreground_path, "PNG")
        print(f"생성 완료: {foreground_path}")

    print("\n모든 아이콘 생성 완료!")


if __name__ == "__main__":
    main()
