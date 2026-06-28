export class Vector2D {
  x: number
  y: number

  constructor(x = 0, y = 0) {
    this.x = x
    this.y = y
  }

  set(x: number, y: number) {
    this.x = x
    this.y = y
    return this
  }

  add(vector: Vector2D) {
    this.x += vector.x
    this.y += vector.y
    return this
  }

  multiply(value: number) {
    this.x *= value
    this.y *= value
    return this
  }

  mag() {
    return Math.hypot(this.x, this.y)
  }

  normalize() {
    const magnitude = this.mag()

    if (magnitude > 0.0001) {
      this.x /= magnitude
      this.y /= magnitude
    }

    return this
  }
}
