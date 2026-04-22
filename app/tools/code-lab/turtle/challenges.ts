export type ChallengeCategory = "tutorial" | "challenge";

export interface TurtleChallenge {
  id: string;
  title: string;
  category: ChallengeCategory;
  description: string;
  hint: string;
  starterCode: string;
}

export const CHALLENGES: TurtleChallenge[] = [
  // ── TUTORIALS ──────────────────────────────────────────────────────────────
  {
    id: "line",
    category: "tutorial",
    title: "1. First Line",
    description: "Make the turtle move forward to draw your first line.",
    hint: "forward(100) moves the turtle 100 steps forward.",
    starterCode: `# The turtle starts at the center, facing right.
# Run the code — then try changing the number!

forward(100)
`,
  },
  {
    id: "turns",
    category: "tutorial",
    title: "2. Turning",
    description: "Combine forward() with right() and left() to change direction.",
    hint: "right(90) turns 90 degrees clockwise. left(90) turns the other way.",
    starterCode: `# forward() moves, right() and left() turn.

forward(100)
right(90)
forward(80)
right(90)
forward(60)
`,
  },
  {
    id: "square",
    category: "tutorial",
    title: "3. Draw a Square",
    description: "Use a for loop to draw all 4 sides without repeating code.",
    hint: "A square has 4 equal sides. Each corner turns 90 degrees.",
    starterCode: `# Repeat the same two steps 4 times!

for i in range(4):
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
    starterCode: `# Try different colors and pen sizes!

pensize(4)
color("royalblue")

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
    starterCode: `# A filled triangle!
# Triangles turn 120° at each corner (360 ÷ 3 = 120)

color("black")
fillcolor("orange")

begin_fill()
for i in range(3):
    forward(120)
    left(120)
end_fill()
`,
  },

  // ── CHALLENGES ─────────────────────────────────────────────────────────────
  {
    id: "star",
    category: "challenge",
    title: "5-Pointed Star",
    description: "Draw a classic 5-pointed star with a filled center.",
    hint: "A 5-pointed star turns right 144° at each point — not 72°. Try it!",
    starterCode: `# A 5-pointed star — the turn angle is the secret!
# Hint: try right(144)

pensize(2)
color("black")
fillcolor("gold")

begin_fill()
for i in range(5):
    forward(120)
    right(144)
end_fill()
`,
  },
  {
    id: "spiral",
    category: "challenge",
    title: "Growing Spiral",
    description: "Draw a spiral by making each step a little longer than the last.",
    hint: "Increase `size` by a small amount each loop. Try different turn angles too!",
    starterCode: `# Increase size a little each step to get a spiral.
# Try changing the turn angle and how much size grows!

pensize(2)
color("teal")

size = 5
for i in range(60):
    forward(size)
    right(30)
    size = size + 3
`,
  },
  {
    id: "house",
    category: "challenge",
    title: "Draw a House",
    description: "Draw a house with a square body and a triangle roof.",
    hint: "Draw the square first, then use penup() and goto() to position at a top corner for the roof.",
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
  {
    id: "olympic-rings",
    category: "challenge",
    title: "Olympic Rings",
    description: "Draw the 5 Olympic rings in the correct colors: Blue, Yellow, Black, Green, Red.",
    hint: "goto(x, y - 45) puts the turtle at the bottom of a circle centered at (x, y). Use pensize(5) for thick rings.",
    starterCode: `# Olympic Rings
# 5 interlocking circles — Blue, Yellow, Black, Green, Red

pensize(5)

# ── Blue ring (center: -80, 25) ─────────────────
color("blue")
penup()
goto(-80, -20)
pendown()
circle(45)

# ── Now add the other four rings! ───────────────
# Pattern: color → penup → goto(cx, cy-45) → pendown → circle(45)
#
# Yellow center: (-40, -25)  →  goto(-40, -70)
# Black center:  (  0,  25)  →  goto(  0, -20)
# Green center:  ( 40, -25)  →  goto( 40, -70)
# Red center:    ( 80,  25)  →  goto( 80, -20)
`,
  },
  {
    id: "bullseye",
    category: "challenge",
    title: "Bull's-Eye",
    description: "Draw concentric filled rings to make a bull's-eye target.",
    hint: "Draw the largest circle first, then smaller ones on top. goto(0, -r) centers each circle.",
    starterCode: `# Bull's-Eye — draw biggest ring first, then stack smaller ones on top

colors = ["red", "white", "red", "white", "red"]
radii  = [100, 80, 60, 40, 20]

pensize(1)

for i in range(5):
    color("black")
    fillcolor(colors[i])
    begin_fill()
    penup()
    goto(0, -radii[i])
    pendown()
    circle(radii[i])
    end_fill()
`,
  },
  {
    id: "snowflake",
    category: "challenge",
    title: "Snowflake",
    description: "Use a loop inside a loop to draw a snowflake with 6 branches.",
    hint: "Define a branch() function, then call it 6 times turning 60° between each one.",
    starterCode: `# Snowflake — a loop calling a function 6 times

pensize(2)
color("deepskyblue")

def branch(length):
    for i in range(3):
        forward(length)
        backward(length)
        right(45)
    left(135)

for i in range(6):
    branch(80)
    right(60)
`,
  },
];
