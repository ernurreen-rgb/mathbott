from PIL import Image
import os

os.makedirs('tmp/variant_1/cropped', exist_ok=True)

# 1. q_20: Triangle
im20 = Image.open('tmp/variant_1/q_20.jpg')
# Size is (740, 378). Statement is at top (y: 0..70), options at bottom (y: 280..378).
# Diagram is roughly x: 200..600, y: 70..270
crop20 = im20.crop((230, 80, 520, 260))
crop20.save('tmp/variant_1/cropped/v1_q20_triangle.png')

# 2. q_21: Graph
im21 = Image.open('tmp/variant_1/q_21.jpg')
# Size is (740, 451). Statement is at top (y: 0..50), options at bottom (y: 350..451).
# Diagram is roughly x: 180..580, y: 40..340
crop21 = im21.crop((185, 45, 580, 345))
crop21.save('tmp/variant_1/cropped/v1_q21_graph.png')

# 3. q_26: Wave
im26 = Image.open('tmp/variant_1/q_26.jpg')
# Size is (740, 350). Statement is at top (y: 0..85), options at bottom (y: 240..350).
# Wave is roughly x: 200..550, y: 100..235
crop26 = im26.crop((200, 105, 550, 230))
crop26.save('tmp/variant_1/cropped/v1_q26_wave.png')

# 4. q_31: Squares
im31 = Image.open('tmp/variant_1/q_31.jpg')
# Size is (740, 406). Statement at top (0..70), table at bottom (210..406).
# Squares in middle (70..210)
crop31 = im31.crop((250, 75, 460, 215))
crop31.save('tmp/variant_1/cropped/v1_q31_squares.png')

# 5. q_39: Rectangle + Circle
im39 = Image.open('tmp/variant_1/q_39.jpg')
# Size is (740, 461). Statement (0..60), options (330..461).
# Diagram (70..330)
crop39 = im39.crop((245, 75, 490, 330))
crop39.save('tmp/variant_1/cropped/v1_q39_rect_circle.png')

# 6. q_40: Parabola
im40 = Image.open('tmp/variant_1/q_40.jpg')
# Size is (740, 454). Statement (0..60), options (320..454).
# Diagram (70..310)
crop40 = im40.crop((280, 75, 465, 305))
crop40.save('tmp/variant_1/cropped/v1_q40_parabola.png')

print("Cropped all successfully!")
