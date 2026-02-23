from PIL import Image, ImageDraw, ImageFont
import os
import sys

# ============================================
# 고정 디자인 값 (parent-app)
# ============================================
# 배경색 (연한 핑크색)
PINK_BG = (253, 242, 248)  # #fdf2f8

# 라벨 텍스트
LABEL_TEXT = "학부모"

# 라벨 텍스트 색상 (진한 핑크색)
LABEL_TEXT_COLOR = (190, 24, 93)  # #be185d

# 라벨 배경색 (흰색)
LABEL_BG = (255, 255, 255)  # #ffffff

# 라벨 테두리 색상 (연핑크)
LABEL_BORDER = (249, 168, 212)  # #f9a8d4

# 로고 최대 크기 비율
LOGO_MAX_WIDTH_RATIO = 0.74
LOGO_MAX_HEIGHT_RATIO = 0.74

# 안전 여백 비율
SAFE_PADDING_RATIO = 0.08

# 라벨 너비 비율
LABEL_WIDTH_RATIO = 0.66

# 라벨 높이 비율
LABEL_HEIGHT_RATIO = 0.19

# 라벨 코너 반경 비율
LABEL_CORNER_RATIO = 0.45

# 라벨 겹침 비율 (로고와 겹침)
LABEL_OVERLAP_RATIO = 0.06

# 폰트 크기 비율
FONT_SIZE_RATIO = 0.11

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


def create_icon_with_label(logo_img, size, is_foreground=False):
    """
    로고 이미지에 '학부모용' 라벨을 추가한 아이콘 생성
    """

    # 배경 생성
    if is_foreground:
        icon = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    else:
        icon = Image.new('RGBA', (size, size), PINK_BG + (255,))

    # 로고 크기 계산 (비율 유지)
    logo_max_width = int(size * LOGO_MAX_WIDTH_RATIO)
    logo_max_height = int(size * LOGO_MAX_HEIGHT_RATIO)

    # 로고 리사이즈 (비율 유지)
    logo_resized = logo_img.copy()
    logo_resized.thumbnail((logo_max_width, logo_max_height), Image.Resampling.LANCZOS)

    # 로고 위치 계산 (가로는 중앙, 세로는 위쪽으로)
    logo_x = (size - logo_resized.width) // 2
    logo_y = int(size * 0.08)  # 아이콘을 위로 올림

    # 로고 붙여넣기
    if logo_resized.mode == 'RGBA':
        icon.paste(logo_resized, (logo_x, logo_y), logo_resized)
    else:
        icon.paste(logo_resized, (logo_x, logo_y))

    # 라벨 크기 계산
    label_width = int(size * LABEL_WIDTH_RATIO)
    label_height = int(size * LABEL_HEIGHT_RATIO)
    label_x = (size - label_width) // 2
    label_y = logo_y + logo_resized.height - int(size * LABEL_OVERLAP_RATIO)

    # 라벨 그리기
    draw = ImageDraw.Draw(icon)

    # 코너 반경
    corner_radius = int(label_height * LABEL_CORNER_RATIO)

    # 라벨 배경 (흰색)
    draw.rounded_rectangle(
        [label_x, label_y, label_x + label_width, label_y + label_height],
        radius=corner_radius,
        fill=LABEL_BG + (255,)
    )

    # 라벨 테두리 (연핑크 1px)
    draw.rounded_rectangle(
        [label_x, label_y, label_x + label_width, label_y + label_height],
        radius=corner_radius,
        outline=LABEL_BORDER + (255,),
        width=1
    )

    # 폰트 설정
    font_size = int(size * FONT_SIZE_RATIO)
    font = None
    for font_name in ["malgun.ttf", "NanumGothic.ttf"]:
        try:
            font = ImageFont.truetype(font_name, font_size)
            break
        except:
            continue
    if font is None:
        font = ImageFont.load_default()

    # 텍스트 그리기
    bbox = draw.textbbox((0, 0), LABEL_TEXT, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    text_x = label_x + (label_width - text_width) // 2
    text_y = label_y + (label_height - text_height) // 2 - 1

    draw.text((text_x, text_y), LABEL_TEXT, fill=LABEL_TEXT_COLOR + (255,), font=font)

    return icon


def create_round_icon(icon_img, size):
    """원형 아이콘 생성"""
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse([0, 0, size, size], fill=255)

    round_icon = Image.new('RGBA', (size, size), PINK_BG + (255,))
    round_icon.paste(icon_img, (0, 0))

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
        launcher_icon = create_icon_with_label(logo, launcher_size, is_foreground=False)
        launcher_path = os.path.join(folder_path, "ic_launcher.png")
        launcher_icon.save(launcher_path, "PNG")
        print(f"생성 완료: {launcher_path}")

        # ic_launcher_round.png 생성
        round_icon = create_round_icon(launcher_icon, launcher_size)
        round_path = os.path.join(folder_path, "ic_launcher_round.png")
        round_icon.save(round_path, "PNG")
        print(f"생성 완료: {round_path}")

        # ic_launcher_foreground.png 생성
        foreground_size = sizes["foreground"]
        foreground_icon = create_icon_with_label(logo, foreground_size, is_foreground=True)
        foreground_path = os.path.join(folder_path, "ic_launcher_foreground.png")
        foreground_icon.save(foreground_path, "PNG")
        print(f"생성 완료: {foreground_path}")

    print("\n모든 아이콘 생성 완료!")


if __name__ == "__main__":
    main()
