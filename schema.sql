-- ==============================================================================
-- RECEIPT TRACKER — DATABASE SCHEMA (PostgreSQL / Supabase)
-- Run this in your Supabase SQL Editor: Dashboard -> SQL Editor -> New Query
-- ==============================================================================

-- 1. Create Receipts Table
CREATE TABLE IF NOT EXISTS public.receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    vendor_name VARCHAR(255) NOT NULL,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(10, 2) DEFAULT 0.00,
    category VARCHAR(100) DEFAULT 'General',
    image_url TEXT,
    raw_ocr_json JSONB,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Receipt Line Items Table
CREATE TABLE IF NOT EXISTS public.receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
    item_description VARCHAR(255) NOT NULL,
    quantity NUMERIC(10, 2) DEFAULT 1.0,
    unit_price NUMERIC(10, 2),
    total_price NUMERIC(10, 2) NOT NULL,
    category VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. High-Performance Indexes
CREATE INDEX IF NOT EXISTS idx_receipts_user_id ON public.receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_receipts_date ON public.receipts(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_vendor ON public.receipts(vendor_name);
CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt_id ON public.receipt_items(receipt_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for Receipts (Users can only see & manage their own receipts)
CREATE POLICY "Users can view their own receipts"
    ON public.receipts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own receipts"
    ON public.receipts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own receipts"
    ON public.receipts FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own receipts"
    ON public.receipts FOR DELETE
    USING (auth.uid() = user_id);

-- 6. RLS Policies for Receipt Items (Controlled via the parent receipt's user_id)
CREATE POLICY "Users can view their own receipt items"
    ON public.receipt_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.receipts
            WHERE public.receipts.id = public.receipt_items.receipt_id
            AND public.receipts.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert items for their own receipts"
    ON public.receipt_items FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.receipts
            WHERE public.receipts.id = public.receipt_items.receipt_id
            AND public.receipts.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update items for their own receipts"
    ON public.receipt_items FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.receipts
            WHERE public.receipts.id = public.receipt_items.receipt_id
            AND public.receipts.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete items for their own receipts"
    ON public.receipt_items FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.receipts
            WHERE public.receipts.id = public.receipt_items.receipt_id
            AND public.receipts.user_id = auth.uid()
        )
    );

-- 7. Supabase Storage Bucket Setup & Security
-- Creates the 'receipts' storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage Policy: Users can view their own receipt files (stored in a folder named after their user ID)
CREATE POLICY "Users can read their own receipt images"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Storage Policy: Users can upload their receipt images to their user ID folder
CREATE POLICY "Users can upload their own receipt images"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Storage Policy: Users can delete their own receipt images
CREATE POLICY "Users can delete their own receipt images"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
