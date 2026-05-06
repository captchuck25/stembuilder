export type ChallengeCategory = "tutorial" | "challenge";

export interface TurtleChallenge {
  id: string;
  title: string;
  category: ChallengeCategory;
  description: string;
  hint: string;
  starterCode: string;
  notes?: string;
  example?: string;
  previewLines?: number;   // challenges: how many starter-code lines to leave unblurred
  solutionCode?: string;   // challenges: complete code for the canvas preview
}

export const CHALLENGES: TurtleChallenge[] = [
  // ── TUTORIALS ──────────────────────────────────────────────────────────────
  {
    id: "line",
    category: "tutorial",
    title: "1. First Line",
    description: "Make the turtle move forward to draw your first line.",
    hint: "forward(100) moves the turtle 100 steps forward. Try changing the number!",
    notes: `The turtle is like a pen on wheels — it draws a line wherever it moves.

\`forward(steps)\` moves the turtle forward that many steps in the direction it's facing. The bigger the number, the longer the line.

The turtle starts at the center of the canvas, pointing right.

Try changing the number — what happens with 50? With 200?`,
    example: `forward(100)`,
    starterCode: `# forward(steps) moves the turtle forward.
# Call forward() with a number to draw your first line!

`,
  },
  {
    id: "turns",
    category: "tutorial",
    title: "2. Turning",
    description: "Combine forward() with right() and left() to change direction.",
    hint: "right(90) turns 90 degrees clockwise. left(90) turns the other way.",
    notes: `\`right(angle)\` turns the turtle clockwise.
\`left(angle)\` turns it counter-clockwise.

Angles are measured in degrees. \`right(90)\` is a quarter-turn right. \`right(180)\` is a U-turn.

You can chain as many \`forward()\` and turn commands as you want to build any path!`,
    previewLines: 2,
    example: `forward(100)
right(90)
forward(80)
right(90)
forward(60)`,
    starterCode: `# right() and left() turn the turtle.
# Add a turn and another forward() to make an L-shape!

forward(100)
`,
  },
  {
    id: "square",
    category: "tutorial",
    title: "3. Draw a Square",
    description: "Use a for loop to draw all 4 sides without repeating code.",
    hint: "A square has 4 equal sides. Each corner turns 90 degrees.",
    notes: `A \`for\` loop repeats a block of code a set number of times.

\`for i in range(4):\` runs the indented code 4 times — with \`i\` counting 0, 1, 2, 3.

A square has 4 equal sides and 4 corners. Each corner turns 90°.
(360° ÷ 4 sides = 90° per corner)

The indented lines inside the loop run on every repeat.`,
    previewLines: 1,
    example: `for i in range(4):
    forward(100)
    right(90)`,
    starterCode: `# Wrap the two lines below in a for loop to repeat them 4 times.
# Hint: for i in range(4):

forward(100)
right(90)
`,
  },
  {
    id: "colors",
    category: "tutorial",
    title: "4. Color & Pen Size",
    description: "Change the pen color and thickness to make your drawing stand out.",
    hint: 'Try color("red"), pensize(5), or any color name like "royalblue" or "gold".',
    notes: `\`color("name")\` sets the pen color. You can use any color name — \`"red"\`, \`"gold"\`, \`"royalblue"\`, \`"teal"\` — or a hex code like \`"#ff6600"\`.

\`pensize(n)\` sets how thick the line is. The default is 1. Try 3, 5, or 10!

Call these before you start drawing — they style everything that comes after.`,
    example: `pensize(4)
color("royalblue")

for i in range(4):
    forward(100)
    right(90)`,
    starterCode: `# Add color() and pensize() before the loop to style your square.

for i in range(4):
    forward(100)
    right(90)
`,
  },
  {
    id: "fill",
    category: "tutorial",
    title: "5. Filled Shapes",
    description: "Use begin_fill() and end_fill() to fill a shape with color.",
    hint: "Set fillcolor() before begin_fill(). The fill closes automatically when you call end_fill().",
    notes: `\`begin_fill()\` tells the turtle to start recording its path.
\`end_fill()\` closes the shape and fills it with color.

Set \`fillcolor("color")\` before \`begin_fill()\` to choose the fill. The pen color and fill color are separate.

Any closed shape works — triangles, squares, stars — as long as you wrap the drawing in \`begin_fill()\` and \`end_fill()\`.`,
    example: `color("black")
fillcolor("orange")

begin_fill()
for i in range(3):
    forward(120)
    left(120)
end_fill()`,
    starterCode: `# Add begin_fill() before the loop and end_fill() after it.
# Set fillcolor() to choose your color!

color("black")

for i in range(3):
    forward(120)
    left(120)
`,
  },

  {
    id: "ladder",
    category: "tutorial",
    title: "6. Goto & the Grid",
    description: "Use goto() to jump anywhere on the canvas grid. Draw a rainbow ladder of colored lines.",
    hint: "penup() before goto() lifts the pen so you move without drawing. Then pendown() and forward(200) draws the rung.",
    notes: `The canvas has a hidden grid — (0, 0) is the center.
Positive x goes right, negative x goes left.
Positive y goes up, negative y goes down.

\`goto(x, y)\` jumps the turtle to any point on the grid instantly.

Use it with \`penup()\` and \`pendown()\` so you can start drawing from anywhere:

\`penup()\` — lift the pen (travel without drawing)
\`goto(x, y)\` — jump to a new grid position
\`pendown()\` — lower the pen, ready to draw
\`forward(200)\` — draw a line 200 steps to the right

In the example, each rung starts at x = -100 and a different y height.
\`forward(200)\` draws 200 steps to the right, landing at x = 100.
The result is a rainbow ladder of 5 horizontal lines across the center of the canvas.`,
    previewLines: 15,
    example: `# Rainbow Ladder — draw 5 colored lines at different heights!
# goto(x, y) jumps to a grid coordinate. (0, 0) is the center.
pensize(4)

# Bottom rung
color("red")
penup()
goto(-100, -80)
pendown()
forward(200)

# 2nd rung
color("blue")
penup()
goto(-100, -40)
pendown()
forward(200)

# 3rd rung
color("yellow")
penup()
goto(-100, 0)
pendown()
forward(200)

# 4th rung
color("orange")
penup()
goto(-100, 40)
pendown()
forward(200)

# 5th rung
color("black")
penup()
goto(-100, 80)
pendown()
forward(200)`,
    starterCode: `# Rainbow Ladder — draw 5 colored lines at different heights!
# goto(x, y) jumps to a grid coordinate. (0, 0) is the center.
pensize(4)

# Bottom rung
color("red")
penup()
goto(-100, -80)
pendown()
forward(200)

# Add more rungs above!
# Try blue, yellow, orange, black — each 40 higher (y = -40, 0, 40, 80)
`,
  },

  // ── CHALLENGES ─────────────────────────────────────────────────────────────
  // Order: star, bullseye, olympic-rings, house, school-bus
  {
    id: "star",
    category: "challenge",
    title: "5-Pointed Star",
    description: "Draw a classic 5-pointed star with a filled center. The secret is the turn angle — it's not 72°!",
    hint: "Each point of the star needs a big turn — experiment between 130° and 150° to find the one that closes perfectly.",
    previewLines: 9,
    solutionCode: `pensize(2)
color("black")
fillcolor("gold")
begin_fill()
for i in range(5):
    forward(120)
    right(144)
end_fill()`,
    starterCode: `# A 5-pointed star — the turn angle is the secret!
# Hint: try right() somewhere between 130-150 degrees

pensize(2)
color("black")
fillcolor("?????")

begin_fill()
for i in range(?):
    forward(120)
    right(???)
end_fill()
`,
  },
  {
    id: "bullseye",
    category: "challenge",
    title: "Bull's-Eye",
    description: "Draw a bull's-eye target with three concentric rings. Each ring is built from 180 tiny forward steps — shrink the step size to shrink the ring.",
    hint: "Each ring uses the same loop: forward(step) + left(2) × 180. Halve the step to halve the radius. For the innermost ring, use begin_fill() and end_fill() to fill it solid!",
    previewLines: 11,
    solutionCode: `color("red")
pensize(10)
penup()
goto(0,-150)
pendown()
for i in range(180):
    forward(5)
    left(2)
color("red")
pensize(10)
penup()
goto(0,-90)
pendown()
for i in range(180):
    forward(3)
    left(2)
color("red")
fillcolor("red")
pensize(10)
penup()
goto(0,-45)
pendown()
begin_fill()
for i in range(180):
    forward(1.5)
    left(2)
end_fill()`,
    starterCode: `# Bull's-Eye — three rings, each drawn with forward() + left()
# Each ring: goto(0, -radius) to start, then loop forward(step) + left(2) x 180

# Outer ring
color("red")
pensize(10)
penup()
goto(0, -150)
pendown()
for i in range(180):
    forward(5)
    left(2)

# Middle ring — use a smaller forward() step and a closer goto()



# Bull's-eye — same idea, but fill it solid!
# Hint: add begin_fill() ... end_fill() to complete the bullseye
`,
  },
  {
    id: "olympic-rings",
    category: "challenge",
    title: "Olympic Rings",
    description: "Draw the 5 Olympic rings in the correct colors and positions: Blue, Black, Red on top — Yellow, Green on the bottom.",
    hint: "Each ring is the same loop as the bull's-eye: forward(2) + left(2) × 180. Just change the color and the goto() position for each ring. Top row y = -20, bottom row y = -100.",
    previewLines: 11,
    solutionCode: `pensize(3)

# Blue ring
color("blue")
penup()
goto(-120, -20)
pendown()
for i in range(180):
    forward(2)
    left(2)

# Back ring
color("black")
penup()
goto(-20, -20)
pendown()
for i in range(180):
    forward(2)
    left(2)

# Red ring
color("red")
penup()
goto(80, -20)
pendown()
for i in range(180):
    forward(2)
    left(2)

# Yellow ring
color("yellow")
penup()
goto(-70, -100)
pendown()
for i in range(180):
    forward(2)
    left(2)

# Green ring
color("green")
penup()
goto(30, -100)
pendown()
for i in range(180):
    forward(2)
    left(2)`,
    starterCode: `# Olympic Rings
# 5 interlocking circles — Blue, Black, Red on top, Yellow & Green on bottom
# Each ring uses the same loop as the bull's-eye: forward(2) + left(2) x 180

pensize(3)

# Blue ring (top-left)
color("blue")
penup()
goto(-120, -20)
pendown()
for i in range(180):
    forward(2)
    left(2)

# ── Now add the other four rings ─────────────────
# Pattern: color → penup → goto(x, y) → pendown → loop forward(2) + left(2) x 180
#
# Top row    (y = -20):  Black at x = -20,  Red at x = 80
# Bottom row (y = -100): Yellow at x = -70, Green at x = 30
`,
  },
  {
    id: "house",
    category: "challenge",
    title: "Draw a House",
    description: "Draw a house with a square body and a triangle roof. Two shapes, one picture!",
    hint: "Draw the square first, then use penup() and goto() to position at a top corner for the roof.",
    previewLines: 11,
    solutionCode: `pensize(2)
color("black")
fillcolor("tomato")
begin_fill()
for i in range(4):
    forward(120)
    right(90)
end_fill()
fillcolor("saddlebrown")
penup()
goto(0, 120)
pendown()
begin_fill()
for i in range(3):
    forward(120)
    left(120)
end_fill()`,
    starterCode: `# Draw a house: square walls + triangle roof
pensize(2)
color("black")

# Walls (square)
fillcolor("tomato")
begin_fill()
for i in range(4):
    forward(120)
    right(90)
end_fill()

# Roof (triangle on top)
# Hint: move to the top-left corner of the square first
fillcolor("saddlebrown")
penup()
goto(0, 120)
pendown()
begin_fill()
# Now draw the triangle roof!
# Each side is 120 long, turning left 120° at each peak
`,
  },
  {
    id: "school-bus",
    category: "challenge",
    title: "School Bus",
    description: "Build a school bus! The body is done — add windows, wheels, and any details you like.",
    hint: "Use goto(x, y) to position, then begin_fill() / end_fill() for each colored shape. Wheels use circle(r).",
    previewLines: 16,
    solutionCode: `color("black")
pensize(2)
fillcolor("gold")
begin_fill()
penup()
goto(-110, -20)
pendown()
goto(100, -20)
goto(100, 55)
goto(-110, 55)
goto(-110, -20)
end_fill()
fillcolor("orange")
begin_fill()
penup()
goto(100, -20)
pendown()
goto(130, -20)
goto(130, 35)
goto(100, 35)
goto(100, -20)
end_fill()
fillcolor("lightblue")
for i in range(3):
    begin_fill()
    penup()
    goto(-95 + i*62, 8)
    pendown()
    goto(-60 + i*62, 8)
    goto(-60 + i*62, 36)
    goto(-95 + i*62, 36)
    goto(-95 + i*62, 8)
    end_fill()
color("black")
fillcolor("black")
penup()
goto(-65, -38)
pendown()
begin_fill()
circle(18)
end_fill()
penup()
goto(55, -38)
pendown()
begin_fill()
circle(18)
end_fill()`,
    starterCode: `# School Bus
color("black")
pensize(2)

# ── Bus body ────────────────────────────────────
fillcolor("gold")
begin_fill()
penup()
goto(-110, -20)
pendown()
goto(100, -20)
goto(100, 55)
goto(-110, 55)
goto(-110, -20)
end_fill()

# ── Front hood ──────────────────────────────────
fillcolor("orange")
begin_fill()
penup()
goto(100, -20)
pendown()
goto(130, -20)
goto(130, 35)
goto(100, 35)
goto(100, -20)
end_fill()

# ── TODO: Add 3 windows ─────────────────────────
# Each window is about 35 wide and 28 tall
# Use fillcolor("lightblue")
# First window hint: starts near (-95, 8)
# Try a loop with goto(-95 + i*62, 8) for i in range(3)



# ── TODO: Add 2 wheels ──────────────────────────
# Use circle(18) for each wheel
# goto(x, y - 18) positions turtle at bottom of a circle centered at (x, y)
# Try wheel centers at (-65, -20) and (55, -20)



# ── TODO: Any extra details? ────────────────────
# Ideas: door, headlight, black bumper strip, roof details
`,
  },
];
