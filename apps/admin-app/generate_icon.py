from PIL import Image, ImageDraw
import os
import sys

# ============================================
# 고정 디자인 값 (admin-app)
# ============================================
# 그라데이션 색상 (상단 → 하단)
GRADIENT_TOP = (186, 230, 253)    # #bae6fd (light blue)
GRADIENT_BOTTOM = (37, 99, 235)   # #2563eb (blue)

# 로고 최대 크기 비율
LOGO_MAX_WIDTH_RATIO = 0.75
LOGO_MAX_HEIGHT_RATIO = 0.75

# foreground 투명 배경
FOREGROUND_TRANSPARENT = True

# ============================================
# 경로 설정
# ============================================
base_path = os.path.dirname(os.path.abspath(__file__))
logo_path = os.path.normpath(os.path.join(base_path, "..", "..", "assets", "logo_icon.png"))
res_path = os.path.join(base_path, "android", "app", "src", "main", "res")

# 아이콘 크기 설정
icon_sizes = {
    "mipmap-mdpi": {"launcher": 48, "foreground": 108},
    "mipmap-hdpi": {"launcher": 72, "foreground": 162},
    "mipmap-xhdpi": {"launcher": 96, "foreground": 216},
    "mipmap-xxhdpi": {"launcher": 144, "foreground": 324},
    "mipmap-xxxhdpi": {"launcher": 192, "foreground": 432},
}


def create_gradient_background(size, top_color, bottom_color):
    """수직 그라데이션 배경 생성"""
    img = Image.new('RGBA', (size, size), top_color + (255,))
    draw = ImageDraw.Draw(img)

    # 그라데이션 적용 (상단에서 하단으로)
    for y in range(size):
        ratio = y / size
        r = int(top_color[0] * (1 - ratio) + bottom_color[0] * ratio)
        g = int(top_color[1] * (1 - ratio) + bottom_color[1] * ratio)
        b = int(top_color[2] * (1 - ratio) + bottom_color[2] * ratio)
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

    return img


def create_simple_icon(logo_img, size, is_foreground=False):
    """
    로고만 있는 심플한 아이콘 생성 (그라데이션 배경)
    """

    # 배경 생성 (foreground도 그라데이션 포함)
    icon = create_gradient_background(size, GRADIENT_TOP, GRADIENT_BOTTOM)

    # 로고 크기 계산 (비율 유지)
    logo_max_width = int(size * LOGO_MAX_WIDTH_RATIO)
    logo_max_height = int(size * LOGO_MAX_HEIGHT_RATIO)

    # 로고 리사이즈 (비율 유지)
    logo_resized = logo_img.copy()
    logo_resized.thumbnail((logo_max_width, logo_max_height), Image.Resampling.LANCZOS)

    # 로고 중앙 위치 계산
    logo_x = (size - logo_resized.width) // 2
    logo_y = (size - logo_resized.height) // 2

    # 로고 붙여넣기
    if logo_resized.mode == 'RGBA':
        icon.paste(logo_resized, (logo_x, logo_y), logo_resized)
    else:
        icon.paste(logo_resized, (logo_x, logo_y))

    return icon


def create_round_icon(logo_img, size, top_color, bottom_color):
    """원형 아이콘 생성 (그라데이션 배경)"""
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse([0, 0, size, size], fill=255)

    # 그라데이션 배경
    round_icon = create_gradient_background(size, top_color, bottom_color)

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
        launcher_icon = create_simple_icon(logo, launcher_size, is_foreground=False)
        launcher_path = os.path.join(folder_path, "ic_launcher.png")
        launcher_icon.save(launcher_path, "PNG")
        print(f"생성 완료: {launcher_path}")

        # ic_launcher_round.png 생성
        round_icon = create_round_icon(logo, launcher_size, GRADIENT_TOP, GRADIENT_BOTTOM)
        round_path = os.path.join(folder_path, "ic_launcher_round.png")
        round_icon.save(round_path, "PNG")
        print(f"생성 완료: {round_path}")

        # ic_launcher_foreground.png 생성
        foreground_size = sizes["foreground"]
        foreground_icon = create_simple_icon(logo, foreground_size, is_foreground=True)
        foreground_path = os.path.join(folder_path, "ic_launcher_foreground.png")
        foreground_icon.save(foreground_path, "PNG")
        print(f"생성 완료: {foreground_path}")

    print("\n모든 아이콘 생성 완료!")


if __name__ == "__main__":
    main()
