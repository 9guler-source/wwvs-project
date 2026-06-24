import { NextResponse } from 'next/server';
import { getSimulationMode } from '@/lib/getMode';

export async function GET() {
  const isSimulation = await getSimulationMode();
  return NextResponse.json({ isSimulation });
}
