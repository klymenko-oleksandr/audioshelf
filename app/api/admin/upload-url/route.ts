import { NextRequest, NextResponse } from "next/server";
import { createUploadUrl, generateObjectKey } from "@/lib/s3";
import { uploadUrlSchema } from "@/lib/validators";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = uploadUrlSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { filename, contentType } = parsed.data;
    const objectKey = generateObjectKey(filename);
    const uploadUrl = await createUploadUrl(objectKey, contentType);

    return NextResponse.json({ uploadUrl, objectKey });
  } catch (error) {
    console.error("Failed to generate upload URL:", error);
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}
