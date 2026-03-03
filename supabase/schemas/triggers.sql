CREATE OR REPLACE FUNCTION "public"."update_conversation_leaf"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  update conversations set 
    current_message_leaf_id = new.id,
    updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

CREATE OR REPLACE TRIGGER "update_leaf_trigger" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_conversation_leaf"();

-- Mesh prompt tracking triggers
-- These triggers automatically manage prompt entries for mesh generations

-- Function to handle mesh insert (add prompt immediately)
CREATE OR REPLACE FUNCTION handle_mesh_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert a prompt entry immediately when a mesh is created
    INSERT INTO public.prompts (user_id, type)
    VALUES (NEW.user_id, 'mesh');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle mesh status updates (clean up on failure)
CREATE OR REPLACE FUNCTION handle_mesh_status_update()
RETURNS TRIGGER AS $$
BEGIN
    -- If mesh status changed to 'failure', remove the most recent mesh prompt for this user
    IF OLD.status != 'failure' AND NEW.status = 'failure' THEN
        DELETE FROM public.prompts 
        WHERE user_id = NEW.user_id 
          AND type = 'mesh' 
          AND id = (
              SELECT id FROM public.prompts 
              WHERE user_id = NEW.user_id 
                AND type = 'mesh' 
              ORDER BY created_at DESC 
              LIMIT 1
          );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for mesh insertion
CREATE OR REPLACE TRIGGER mesh_insert_prompt_trigger
    AFTER INSERT ON public.meshes
    FOR EACH ROW
    EXECUTE FUNCTION handle_mesh_insert();

-- Create trigger for mesh status updates
CREATE OR REPLACE TRIGGER mesh_status_update_trigger
    AFTER UPDATE ON public.meshes
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION handle_mesh_status_update();

-- Previews updated_at trigger
-- Function to update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at for previews
CREATE OR REPLACE TRIGGER update_previews_updated_at 
    BEFORE UPDATE ON "public"."previews" 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Profile creation trigger for new users
-- Create function to handle new user sign ups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    )
  );
  RETURN NEW;
END;
$$;

-- Create trigger to automatically create profile on user creation
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
