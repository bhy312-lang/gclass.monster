from PIL import Image, ImageDraw
import os

# ============================================
# 상수 설정 (로고 모양 보존을 위한 파라미터)
# ============================================
# 로고 스케일: 아이콘 크기 대비 로고 크기 비율 (비율 왜곡 방지)
LOGO_SCALE = 0.75

# 안전 여백 비율: adaptive icon safe area 고려 (중앙 66% 영역 보존)
SAFE_PADDING_RATIO = 0.10

# 배경색 (admin-app: 밝은 하늘색)
BACKGROUND_COLOR = (224, 242, 254, 255)  # #e0f2fe

# foreground 투명 배경 여부
FOREGROUND_TRANSPARENT = True

# ============================================
# 경로 설정
# ============================================
base_path = os.path.dirname(os.path.abspath(__file__))
logo_path = os.path.join(base_path, "www", "Logo.png")
res_path = os.path.join(base_path, "android", "app", "src", "main", "res")

# 아이콘 크기 설정
icon_sizes = {
    "mipmap-mdpi": {"launcher": 48, "foreground": 108},
    "mipmap-hdpi": {"launcher": 72, "foreground": 162},
    "mipmap-xhdpi": {"launcher": 96, "foreground": 216},
    "mipmap-xxhdpi": {"launcher": 144, "foreground": 324},
    "mipmap-xxxhdpi": {"launcher": 192, "foreground": 432},
}


def create_simple_icon(logo_img, size, is_foreground=False):
    """
    로고만 있는 심플한 아이콘 생성
    - 로고 비율 왜곡 없음 (thumbnail 사용)
    - 로고 중앙 정렬
    - 안전 여백 확보
    """

    # 배경 생성
    if is_foreground:
        # foreground는 투명 배경
        icon = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    else:
        # 일반 아이콘은 단색 배경
        icon = Image.new('RGBA', (size, size), BACKGROUND_COLOR)

    # 로고 크기 계산 (비율 유지)
    logo_target_size = int(size * LOGO_SCALE)

    # 로고 리사이즈 (thumbnail은 비율 유지하며 축소)
    logo_resized = logo_img.copy()
    logo_resized.thumbnail((logo_target_size, logo_target_size), Image.Resampling.LANCZOS)

    # 로고 중앙 위치 계산
    logo_x = (size - logo_resized.width) // 2
    logo_y = (size - logo_resized.height) // 2

    # 로고 붙여넣기 (RGBA 로고의 투명도 유지)
    if logo_resized.mode == 'RGBA':
        icon.paste(logo_resized, (logo_x, logo_y), logo_resized)
    else:
        icon.paste(logo_resized, (logo_x, logo_y))

    return icon


def create_round_icon(icon_img, size, bg_color):
    """
    원형 아이콘 생성
    - 배경색 포함
    - 로고 잘림 방지
    """
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse([0, 0, size, size], fill=255)

    # 배경색 원형 이미지
    round_icon = Image.new('RGBA', (size, size), bg_color)

    # 로고 중앙에 배치
    logo_target_size = int(size * LOGO_SCALE)
    logo_resized = icon_img.copy()
    logo_resized.thumbnail((logo_target_size, logo_target_size), Image.Resampling.LANCZOS)

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
        return

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
        round_icon = create_round_icon(logo, launcher_size, BACKGROUND_COLOR)
        round_path = os.path.join(folder_path, "ic_launcher_round.png")
        round_icon.save(round_path, "PNG")
        print(f"생성 완료: {round_path}")

        # ic_launcher_foreground.png 생성 (투명 배경)
        foreground_size = sizes["foreground"]
        foreground_icon = create_simple_icon(logo, foreground_size, is_foreground=True)
        foreground_path = os.path.join(folder_path, "ic_launcher_foreground.png")
        foreground_icon.save(foreground_path, "PNG")
        print(f"생성 완료: {foreground_path}")

    print("\n모든 아이콘 생성 완료!")


if __name__ == "__main__":
    main()
