export function drawWaveform(
  canvasContext: CanvasRenderingContext2D,
  dataArray: Uint8Array,
  bufferLength: number,
  canvas: HTMLCanvasElement,
  color: string = '#3B82F6'
) {
  const width = canvas.width;
  const height = canvas.height;
  const sliceWidth = width / bufferLength;
  let x = 0;

  // Clear canvas
  canvasContext.fillStyle = '#ffffff';
  canvasContext.fillRect(0, 0, width, height);

  // Draw waveform
  canvasContext.lineWidth = 2;
  canvasContext.strokeStyle = color;
  canvasContext.beginPath();
  canvasContext.moveTo(0, height / 2);

  // Create smooth waveform
  for (let i = 0; i < bufferLength; i++) {
    const v = dataArray[i] / 128.0;
    const y = (v * height) / 2;

    if (i === 0) {
      canvasContext.moveTo(x, y);
    } else {
      // Use quadratic curves for smoother lines
      const xc = (x + (x - sliceWidth)) / 2;
      const yc = (y + (dataArray[i - 1] / 128.0 * height / 2)) / 2;
      canvasContext.quadraticCurveTo(xc, yc, x, y);
    }

    x += sliceWidth;
  }

  // Complete the path
  canvasContext.lineTo(width, height / 2);
  canvasContext.stroke();

  // Add gradient effect
  const gradient = canvasContext.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
  gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.1)');
  gradient.addColorStop(1, 'rgba(59, 130, 246, 0.2)');
  
  canvasContext.fillStyle = gradient;
  canvasContext.fill();

  // Add subtle grid lines
  canvasContext.strokeStyle = 'rgba(59, 130, 246, 0.1)';
  canvasContext.lineWidth = 1;
  
  // Vertical lines
  for (let i = 0; i < width; i += 50) {
    canvasContext.beginPath();
    canvasContext.moveTo(i, 0);
    canvasContext.lineTo(i, height);
    canvasContext.stroke();
  }
  
  // Horizontal lines
  for (let i = 0; i < height; i += 20) {
    canvasContext.beginPath();
    canvasContext.moveTo(0, i);
    canvasContext.lineTo(width, i);
    canvasContext.stroke();
  }
}