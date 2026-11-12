from PIL import Image

# 3. q_26: Wave
im26 = Image.open('tmp/variant_1/q_26.jpg')
# Crop wave cleanly without any text
crop26 = im26.crop((205, 95, 545, 215))
crop26.save('tmp/variant_1/cropped/v1_q26_wave.png')

# 4. q_31: Squares
im31 = Image.open('tmp/variant_1/q_31.jpg')
# Include full "7-ге кем"
crop31 = im31.crop((245, 60, 465, 215))
crop31.save('tmp/variant_1/cropped/v1_q31_squares.png')

print("Refined crops saved!")
