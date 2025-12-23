import { NextRequest, NextResponse } from "next/server";
import { generateImageVariants, validateImage, getImageVariantKey } from "@/lib/image-optimizer";
import { createUploadUrl, generateObjectKey } from "@/lib/s3";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    
    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await validateImage(buffer);

    const variants = await generateImageVariants(buffer);

    const baseObjectKey = generateObjectKey(file.name, "covers");
    
    const uploadPromises = Object.entries(variants).map(async ([variant, data]) => {
      const variantKey = getImageVariantKey(baseObjectKey, variant as keyof typeof variants);
      const uploadUrl = await createUploadUrl(variantKey, "image/webp");
      
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: data.buffer,
        headers: {
          "Content-Type": "image/webp",
        },
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload ${variant} variant`);
      }

      return {
        variant,
        objectKey: variantKey,
        width: data.width,
        height: data.height,
        size: data.size,
      };
    });

    const uploadedVariants = await Promise.all(uploadPromises);

    const variantsMap = uploadedVariants.reduce((acc, item) => {
      acc[item.variant] = {
        objectKey: item.objectKey,
        width: item.width,
        height: item.height,
        size: item.size,
      };
      return acc;
    }, {} as Record<string, any>);

    return NextResponse.json({
      baseObjectKey,
      variants: variantsMap,
    });
  } catch (error) {
    console.error("Failed to optimize and upload image:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process image" },
      { status: 500 }
    );
  }
}
